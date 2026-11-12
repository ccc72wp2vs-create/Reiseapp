import { beforeEach, describe, expect, it } from 'vitest';
import { Client, createTestEnv, inviteUser, SETUP_TOKEN, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
beforeEach(() => {
  t = createTestEnv();
});

async function newTrip(c: Client, extra: Record<string, unknown> = {}) {
  const r = await c.post('/trips', {
    name: 'Testreise',
    startDate: '2026-11-06',
    endDate: '2026-11-26',
    baseCurrency: 'EUR',
    localCurrency: 'THB',
    ...extra,
  });
  expect(r.status).toBe(201);
  return r.body.trip.id as string;
}

describe('auth & bootstrap', () => {
  it('requires setup token, allows setup only once', async () => {
    const anon = new Client(t);
    expect((await anon.get('/auth/status')).body).toMatchObject({ setupRequired: true, setupEnabled: true, user: null });
    const bad = await anon.post('/auth/setup', { setupToken: 'x'.repeat(20), email: 'a@b.de', displayName: 'A', password: 'langes-passwort-1' });
    expect(bad.status).toBe(403);
    await setupOwner(t);
    const again = await new Client(t).post('/auth/setup', {
      setupToken: SETUP_TOKEN,
      email: 'evil@b.de',
      displayName: 'E',
      password: 'langes-passwort-1',
    });
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe('setup_unavailable');
  });

  it('logs in, rejects wrong passwords and logs out', async () => {
    await setupOwner(t);
    const c = new Client(t);
    expect((await c.post('/auth/login', { email: 'owner@example.com', password: 'falsch' })).status).toBe(401);
    const ok = await c.post('/auth/login', { email: 'OWNER@example.com', password: 'sehr-geheimes-passwort' });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('set-cookie')).toMatch(/HttpOnly/);
    expect(ok.headers.get('set-cookie')).toMatch(/SameSite=Lax/);
    expect((await c.get('/auth/me')).status).toBe(200);
    await c.post('/auth/logout');
    expect((await c.get('/auth/me')).status).toBe(401);
  });

  it('rate-limits repeated failed logins per e-mail', async () => {
    await setupOwner(t);
    const c = new Client(t);
    let last = 0;
    for (let i = 0; i < 10; i++) last = (await c.post('/auth/login', { email: 'owner@example.com', password: 'falsch' })).status;
    expect(last).toBe(429);
  });

  it('rejects state-changing requests without CSRF header or from foreign origins', async () => {
    const c = await setupOwner(t);
    const noHeader = await c.req('POST', '/trips', { name: 'x' }, { 'x-travio-csrf': '' });
    expect(noHeader.status).toBe(403);
    const foreign = await c.req('POST', '/trips', { name: 'x' }, { origin: 'https://evil.example' });
    expect(foreign.status).toBe(403);
  });

  it('stores no plaintext tokens or passwords', async () => {
    const c = await setupOwner(t);
    const token = c.cookie.split('=')[1];
    const sessions = t.db.sqlite.prepare('SELECT id FROM sessions').all() as { id: string }[];
    expect(sessions.some((s) => s.id === token)).toBe(false);
    const user = t.db.sqlite.prepare('SELECT password_hash FROM users').get() as { password_hash: string };
    expect(user.password_hash.startsWith('pbkdf2-sha256$100000$')).toBe(true);
  });
});

describe('authorization', () => {
  it('hides foreign trips (404) and enforces roles', async () => {
    const owner = await setupOwner(t);
    const tripId = await newTrip(owner);
    const viewer = await inviteUser(t, owner, tripId, 'viewer', 'viewer@example.com');
    const otherTripOwner = await inviteUser(t, owner, await newTrip(owner), 'owner', 'other@example.com');

    // Viewer can read but not write
    expect((await viewer.get(`/trips/${tripId}/snapshot`)).status).toBe(200);
    const write = await viewer.post(`/trips/${tripId}/activities`, { title: 'X', date: '2026-11-08' });
    expect(write.status).toBe(403);

    // Non-member cannot even see that the trip exists
    expect((await otherTripOwner.get(`/trips/${tripId}`)).status).toBe(404);
    expect((await otherTripOwner.get(`/trips/${tripId}/snapshot`)).status).toBe(404);

    // Cross-trip references are rejected
    const otherTrip = (await otherTripOwner.get('/trips')).body.trips[0].id;
    const place = await otherTripOwner.post(`/trips/${otherTrip}/places`, { name: 'Fremder Ort' });
    expect(place.status).toBe(201);
    const act = await owner.post(`/trips/${tripId}/activities`, { title: 'A', date: '2026-11-08', placeId: place.body.place.id });
    expect(act.status).toBe(422);
  });

  it('invitations are single-use and expire', async () => {
    const owner = await setupOwner(t);
    const tripId = await newTrip(owner);
    const inv = await owner.post(`/trips/${tripId}/invitations`, { role: 'editor' });
    const a = new Client(t);
    const ok = await a.post(`/invitations/${inv.body.token}/accept`, { account: { email: 'a@example.com', displayName: 'A', password: 'passwort-123456' } });
    expect(ok.status).toBe(200);
    const b = new Client(t);
    const reused = await b.post(`/invitations/${inv.body.token}/accept`, { account: { email: 'b@example.com', displayName: 'B', password: 'passwort-123456' } });
    expect(reused.status).toBe(409);
    // b's account must not have been created by the failed attempt
    expect(t.db.sqlite.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'b@example.com'").get()).toEqual({ n: 0 });

    const inv2 = await owner.post(`/trips/${tripId}/invitations`, { role: 'viewer' });
    t.db.sqlite.prepare("UPDATE invitations SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(inv2.body.invitation.id);
    const expired = await new Client(t).post(`/invitations/${inv2.body.token}/accept`, {
      account: { email: 'c@example.com', displayName: 'C', password: 'passwort-123456' },
    });
    expect(expired.status).toBe(409);
  });
});

describe('itinerary & optimistic locking', () => {
  it('detects concurrent edits instead of overwriting', async () => {
    const owner = await setupOwner(t);
    const tripId = await newTrip(owner);
    const editor = await inviteUser(t, owner, tripId, 'editor', 'ed@example.com');
    const created = await owner.post(`/trips/${tripId}/activities`, { title: 'Tempel', date: '2026-11-08', category: 'sightseeing' });
    const a = created.body.activity;
    expect(a.version).toBe(1);
    const e1 = await editor.patch(`/trips/${tripId}/activities/${a.id}`, { version: 1, title: 'Tempel (Editor)' });
    expect(e1.status).toBe(200);
    const stale = await owner.patch(`/trips/${tripId}/activities/${a.id}`, { version: 1, title: 'Tempel (Owner)' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.details.current.title).toBe('Tempel (Editor)');
  });

  it('reorders, duplicates and validates times', async () => {
    const owner = await setupOwner(t);
    const tripId = await newTrip(owner);
    const ids: string[] = [];
    for (const title of ['A', 'B', 'C']) ids.push((await owner.post(`/trips/${tripId}/activities`, { title, date: '2026-11-08' })).body.activity.id);
    await owner.post(`/trips/${tripId}/activities/reorder`, { date: '2026-11-08', orderedIds: [ids[2], ids[0], ids[1]] });
    const snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(snap.activities.map((x: { title: string }) => x.title)).toEqual(['C', 'A', 'B']);
    const dup = await owner.post(`/trips/${tripId}/activities/${ids[0]}/duplicate`);
    expect(dup.body.activity.title).toBe('A');
    const bad = await owner.post(`/trips/${tripId}/activities`, { title: 'X', date: '2026-11-08', startTime: '10:00', endTime: '09:00' });
    expect(bad.status).toBe(422);
  });

  it('changing one destination never changes other stops', async () => {
    const owner = await setupOwner(t);
    const tripId = await newTrip(owner);
    const d1 = (await owner.post(`/trips/${tripId}/destinations`, { name: 'A', arrivalDate: '2026-11-07', departureDate: '2026-11-09', timezone: 'Asia/Bangkok' })).body.destination;
    const d2 = (await owner.post(`/trips/${tripId}/destinations`, { name: 'B', arrivalDate: '2026-11-09', departureDate: '2026-11-12', timezone: 'Asia/Bangkok' })).body.destination;
    await owner.patch(`/trips/${tripId}/destinations/${d1.id}`, { version: d1.version, departureDate: '2026-11-10' });
    const snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    const b = snap.destinations.find((d: { id: string }) => d.id === d2.id);
    expect(b.arrivalDate).toBe('2026-11-09');
    expect(b.version).toBe(d2.version);
  });
});

describe('offline sync', () => {
  it('is idempotent and reports conflicts', async () => {
    const owner = await setupOwner(t);
    const tripId = await newTrip(owner);
    const id = crypto.randomUUID();
    const op = { opId: crypto.randomUUID(), entity: 'activity', action: 'create', id, data: { title: 'Offline', date: '2026-11-10' } };
    const r1 = await owner.post(`/trips/${tripId}/sync`, { ops: [op] });
    expect(r1.body.results[0].status).toBe('applied');
    const r2 = await owner.post(`/trips/${tripId}/sync`, { ops: [op] });
    expect(r2.body.results[0].status).toBe('duplicate');
    const snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(snap.activities.filter((a: { id: string }) => a.id === id)).toHaveLength(1);

    // Someone else edits online → offline update based on v1 conflicts
    await owner.patch(`/trips/${tripId}/activities/${id}`, { version: 1, title: 'Online geändert' });
    const conflict = await owner.post(`/trips/${tripId}/sync`, {
      ops: [{ opId: crypto.randomUUID(), entity: 'activity', action: 'update', id, baseVersion: 1, data: { title: 'Offline geändert' } }],
    });
    expect(conflict.body.results[0].status).toBe('conflict');
    expect(conflict.body.results[0].entity.title).toBe('Online geändert');
  });

  it('respects private packing lists', async () => {
    const owner = await setupOwner(t);
    const tripId = await newTrip(owner);
    const editor = await inviteUser(t, owner, tripId, 'editor', 'ed@example.com');
    const listId = crypto.randomUUID();
    await owner.post(`/trips/${tripId}/sync`, {
      ops: [{ opId: crypto.randomUUID(), entity: 'packing_list', action: 'create', id: listId, data: { name: 'Meine Liste', visibility: 'private' } }],
    });
    const snap = (await editor.get(`/trips/${tripId}/snapshot`)).body;
    expect(snap.packingLists.find((l: { id: string }) => l.id === listId)).toBeUndefined();
    const sneaky = await editor.post(`/trips/${tripId}/sync`, {
      ops: [{ opId: crypto.randomUUID(), entity: 'packing_item', action: 'create', id: crypto.randomUUID(), data: { listId, name: 'X' } }],
    });
    expect(sneaky.body.results[0].status).toBe('rejected');
  });

  it('links invited accounts to the right traveler instead of duplicating', async () => {
    const owner = await setupOwner(t);
    const tripId = (await owner.post('/imports/thailand-2026')).body.tripId;
    let snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    const [, t2, t3, t4] = snap.travelers;
    for (const [tr, n] of [[t2, 'Lilli'], [t3, 'Tim'], [t4, 'Annika']] as const) {
      await owner.patch(`/trips/${tripId}/travelers/${tr.id}`, { name: n, version: tr.version });
    }
    // 1. invitation created for a specific person
    const inv = await owner.post(`/trips/${tripId}/invitations`, { role: 'editor', travelerId: t2.id });
    await new Client(t).post(`/invitations/${inv.body.token}/accept`, { account: { email: 'x@example.com', displayName: 'Lilli M.', password: 'passwort-123456' } });
    // 2. no person selected, but the display name matches exactly one unlinked person
    const inv2 = await owner.post(`/trips/${tripId}/invitations`, { role: 'editor' });
    await new Client(t).post(`/invitations/${inv2.body.token}/accept`, { account: { email: 'tim@example.com', displayName: 'tim', password: 'passwort-123456' } });
    // 3. a genuinely new person
    const inv3 = await owner.post(`/trips/${tripId}/invitations`, { role: 'viewer' });
    await new Client(t).post(`/invitations/${inv3.body.token}/accept`, { account: { email: 'max@example.com', displayName: 'Max', password: 'passwort-123456' } });
    snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(snap.travelers.map((x: { name: string }) => x.name)).toEqual(['Owner', 'Lilli', 'Tim', 'Annika', 'Max']);
    expect(snap.travelers.filter((x: { userId: string | null }) => x.userId).length).toBe(4);
    expect(snap.travelers.find((x: { id: string }) => x.id === t2.id).userId).not.toBeNull();
    expect(snap.travelers.find((x: { id: string }) => x.id === t3.id).userId).not.toBeNull();
  });
});
