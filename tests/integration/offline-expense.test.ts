import { beforeEach, describe, expect, it } from 'vitest';
import { localExpense } from '../../shared/offlineExpense';
import { createTestEnv, inviteUser, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
beforeEach(() => {
  t = createTestEnv();
});

const OP = '3f1c7a10-0000-4000-8000-000000000001';
const ID = '3f1c7a10-0000-4000-8000-0000000000e1';

describe('offline expenses via sync', () => {
  it('creates the expense once (retry is idempotent) and matches the local copy', async () => {
    const owner = await setupOwner(t);
    const tripId = (await owner.post('/trips', { name: 'R', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR' })).body.trip.id;
    const a = (await owner.post(`/trips/${tripId}/travelers`, { name: 'Lilli' })).body.traveler;
    const b = (await owner.post(`/trips/${tripId}/travelers`, { name: 'John' })).body.traveler;
    const data = {
      title: 'Nachtmarkt',
      amountMinor: 45000,
      currency: 'THB',
      date: '2026-11-21',
      category: 'food' as const,
      paidByTravelerId: a.id,
      splitMethod: 'equal' as const,
      splits: [{ travelerId: a.id }, { travelerId: b.id }],
      fxRate: '0.0262',
      fxSource: 'cached' as const,
      fxDate: '2026-11-20',
    };
    const body = { ops: [{ opId: OP, entity: 'expense', action: 'create', id: ID, data }] };
    const r1 = await owner.post(`/trips/${tripId}/sync`, body);
    expect(r1.body.results[0].status).toBe('applied');
    const r2 = await owner.post(`/trips/${tripId}/sync`, body);
    expect(r2.body.results[0].status).toBe('duplicate');
    const snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(snap.expenses).toHaveLength(1);
    const server = snap.expenses[0];
    const local = localExpense(ID, tripId, 'EUR', data, '');
    expect(server).toMatchObject({ id: ID, fxRate: local.fxRate, fxSource: 'cached', baseAmountMinor: local.baseAmountMinor, paidByTravelerId: a.id });
    expect(server.shares.map((s: { baseShareMinor: number }) => s.baseShareMinor).sort()).toEqual(local.shares.map((s) => s.baseShareMinor).sort());
  });

  it('refuses updates/deletes and viewers', async () => {
    const owner = await setupOwner(t);
    const tripId = (await owner.post('/trips', { name: 'R', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR' })).body.trip.id;
    const r = await owner.post(`/trips/${tripId}/sync`, { ops: [{ opId: OP, entity: 'expense', action: 'delete', id: ID, baseVersion: 1 }] });
    expect(r.body.results[0].status).toBe('rejected');
    const viewer = await inviteUser(t, owner, tripId, 'viewer', 'viewer@example.com');
    const v = await viewer.post(`/trips/${tripId}/sync`, { ops: [{ opId: '3f1c7a10-0000-4000-8000-000000000002', entity: 'expense', action: 'create', id: ID, data: {} }] });
    expect(v.body.results[0].status).toBe('rejected');
  });
});
