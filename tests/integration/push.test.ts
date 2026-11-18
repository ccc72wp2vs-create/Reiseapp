import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runPushChecks } from '../../worker/services/push';
import { createTestEnv, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
let calls: { url: string; headers: Record<string, string> }[];

const b64url = (b: ArrayBuffer) => Buffer.from(b).toString('base64url');

beforeEach(async () => {
  t = createTestEnv();
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  t.env.VAPID_PRIVATE_KEY = JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey));
  t.env.VAPID_PUBLIC_KEY = b64url((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer);
  calls = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {})) });
    return new Response(null, { status: 201 });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const sub = (n: number) => ({ endpoint: `https://web.push.apple.com/abc${n}`, keys: { p256dh: 'BPx'.padEnd(80, 'a'), auth: 'auth'.padEnd(22, 'b') } });

describe('push notifications', () => {
  it('subscribes, sends a VAPID push without content and hands out the message once', async () => {
    const owner = await setupOwner(t);
    expect((await owner.get('/push/config')).body).toMatchObject({ enabled: true, publicKey: t.env.VAPID_PUBLIC_KEY });
    expect((await owner.post('/push/subscribe', sub(1))).status).toBe(200);
    const { notifyUsers } = await import('../../worker/services/push');
    const me = (await owner.get('/auth/me')).body.user.id;
    expect(await notifyUsers(t.env, [me], { kind: 'checkin', tripId: null, title: 'Check-in offen: FD 3073', body: 'Jetzt einchecken.', url: '/buchungen', dedupeKey: 'k1' })).toBe(1);
    expect(calls[0].url).toBe('https://web.push.apple.com/abc1');
    expect(calls[0].headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    expect(calls[0].headers['Content-Length']).toBe('0');
    // Same dedupe key → not again.
    expect(await notifyUsers(t.env, [me], { kind: 'checkin', tripId: null, title: 'x', body: 'y', url: '/', dedupeKey: 'k1' })).toBe(0);
    const inbox = (await owner.post('/push/inbox', {})).body.messages;
    expect(inbox).toEqual([expect.objectContaining({ title: 'Check-in offen: FD 3073', url: '/buchungen' })]);
    expect((await owner.post('/push/inbox', {})).body.messages).toEqual([]);
  });

  it('respects per-device settings and drops expired subscriptions', async () => {
    const owner = await setupOwner(t);
    const me = (await owner.get('/auth/me')).body.user.id;
    await owner.post('/push/subscribe', { ...sub(2), prefs: { expense: false } });
    const { notifyUsers } = await import('../../worker/services/push');
    expect(await notifyUsers(t.env, [me], { kind: 'expense', tripId: null, title: 'x', body: 'y', url: '/' })).toBe(0);
    vi.stubGlobal('fetch', async () => new Response(null, { status: 410 }));
    await notifyUsers(t.env, [me], { kind: 'checkin', tripId: null, title: 'x', body: 'y', url: '/' });
    expect((await owner.post('/push/status', { endpoint: sub(2).endpoint })).body.subscribed).toBe(false);
  });

  it('hourly check notifies once when a flight check-in opens', async () => {
    const owner = await setupOwner(t);
    await owner.post('/push/subscribe', sub(3));
    const tripId = (await owner.post('/trips', { name: 'R', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR' })).body.trip.id;
    const me = (await owner.get(`/trips/${tripId}/snapshot`)).body.travelers[0];
    await owner.post(`/trips/${tripId}/bookings`, {
      title: 'Flug Krabi → Chiang Mai', type: 'flight', costKind: 'actual', bookingStatus: 'booked', paymentStatus: 'paid',
      startDate: '2026-11-21', startTime: '12:00', startTimezone: 'Asia/Bangkok', flightNumber: 'FD 3073', travelerIds: [me.id],
    });
    const now = new Date('2026-11-20T06:00:00Z'); // 13:00 in Bangkok, AirAsia opens 48 h before
    expect(await runPushChecks(t.env, now)).toBe(1);
    expect(await runPushChecks(t.env, now)).toBe(0);
    expect((await owner.post('/push/inbox', {})).body.messages[0].title).toContain('FD 3073');
  });
});
