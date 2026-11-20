import { beforeEach, describe, expect, it } from 'vitest';
import { createTestEnv, inviteUser, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
beforeEach(() => {
  t = createTestEnv();
});

describe('to-dos and comments', () => {
  it('creates, assigns, completes and deletes to-dos (in the snapshot)', async () => {
    const owner = await setupOwner(t);
    const tripId = (await owner.post('/trips', { name: 'R', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR' })).body.trip.id;
    const lilli = (await owner.post(`/trips/${tripId}/travelers`, { name: 'Lilli' })).body.traveler;
    const c = await owner.post(`/trips/${tripId}/todos`, { title: 'SIM-Karte verlängern', assigneeTravelerId: lilli.id, dueDate: '2026-11-21' });
    expect(c.status).toBe(201);
    const todo = c.body.todo;
    expect(todo).toMatchObject({ title: 'SIM-Karte verlängern', assigneeTravelerId: lilli.id, done: false });
    const u = await owner.patch(`/trips/${tripId}/todos/${todo.id}`, { done: true, version: todo.version });
    expect(u.body.todo.done).toBe(true);
    expect((await owner.get(`/trips/${tripId}/snapshot`)).body.todos).toHaveLength(1);
    expect((await owner.del(`/trips/${tripId}/todos/${todo.id}`)).status).toBe(200);
    expect((await owner.get(`/trips/${tripId}/snapshot`)).body.todos).toHaveLength(0);
  });

  it('comments on a booking: author shown, only own comments deletable, unknown targets refused', async () => {
    const owner = await setupOwner(t);
    const tripId = (await owner.post('/trips', { name: 'R', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR' })).body.trip.id;
    const b = (await owner.post(`/trips/${tripId}/bookings`, { title: 'Elefantenreservat', type: 'activity' })).body.booking;
    const r = await owner.post(`/trips/${tripId}/comments`, { entityType: 'booking', entityId: b.id, text: 'Abholung 8:30 vor dem Hotel' });
    expect(r.status).toBe(201);
    const snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(snap.comments).toEqual([expect.objectContaining({ entityType: 'booking', entityId: b.id, text: 'Abholung 8:30 vor dem Hotel', authorName: expect.any(String) })]);
    expect((await owner.post(`/trips/${tripId}/comments`, { entityType: 'place', entityId: b.id, text: 'x' })).status).toBe(404);
    const editor = await inviteUser(t, owner, tripId, 'editor', 'editor@example.com');
    expect((await editor.del(`/trips/${tripId}/comments/${r.body.comment.id}`)).status).toBe(404);
    expect((await owner.del(`/trips/${tripId}/comments/${r.body.comment.id}`)).status).toBe(200);
  });
});
