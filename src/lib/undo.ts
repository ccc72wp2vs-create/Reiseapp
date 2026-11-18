/**
 * "Rückgängig": after deleting (or changing) something, a toast offers to
 * undo it for a few seconds. Deleted items are recreated through the normal
 * API with their old ID and values; nothing is kept on the server.
 */
import type { ActivityDto, BookingDto, ExpenseDto, PlaceDto } from '../../shared/types';
import { toast } from '../components/toast';
import { t } from '../i18n';
import { http } from './api';
import { tripStore } from './store';

const UNDO_MS = 7000;

export function undoToast(message: string, undo: () => Promise<unknown> | void) {
  toast(message, 'success', {
    duration: UNDO_MS,
    action: {
      label: t.undo.action,
      onClick: () => {
        void (async () => {
          try {
            await undo();
            toast(t.undo.done, 'info');
          } catch (e) {
            toast.error(e);
          }
        })();
      },
    },
  });
}

/** Body that recreates an expense exactly (same ID, payers and shares). */
export function expenseBody(e: ExpenseDto) {
  return {
    id: e.id,
    title: e.title,
    amountMinor: e.amountMinor,
    currency: e.currency,
    date: e.date,
    category: e.category,
    paidByTravelerId: e.payers[0]?.travelerId ?? e.paidByTravelerId,
    payers: e.payers.length > 1 ? e.payers.map((p) => ({ travelerId: p.travelerId, amountMinor: p.amountMinor })) : undefined,
    splitMethod: 'exact' as const,
    splits: e.shares.map((s) => ({ travelerId: s.travelerId, value: s.shareMinor })),
    ...(e.fxSource !== 'identity' ? { fxRate: e.fxRate, fxSource: e.fxSource === 'provider' ? 'provider' : e.fxSource === 'cached' ? 'cached' : 'manual', fxDate: e.fxDate } : {}),
    notes: e.notes,
  };
}

export function deletedExpense(tripId: string, e: ExpenseDto) {
  undoToast(t.undo.deleted(e.title), async () => {
    await tripStore.mutate(async () => {
      await http.post(`/trips/${tripId}/expenses`, expenseBody(e));
      if (e.bookingId) await http.post(`/trips/${tripId}/expenses/${e.id}/link-booking`, { bookingId: e.bookingId }).catch(() => undefined);
    });
  });
}

export function changedExpense(tripId: string, before: ExpenseDto, newVersion: number) {
  undoToast(t.undo.saved, async () => {
    const { id: _id, ...body } = expenseBody(before);
    await tripStore.mutate(() => http.put(`/trips/${tripId}/expenses/${before.id}`, { ...body, version: newVersion }));
  });
}

export function deletedBooking(tripId: string, b: BookingDto) {
  undoToast(t.undo.deleted(b.title), async () => {
    const { tripId: _t, version: _v, createdAt: _c, updatedAt: _u, expenseId, depositExpenseId: _d, depositMinor: _m, ...rest } = b as BookingDto & Record<string, unknown>;
    await tripStore.mutate(async () => {
      await http.post(`/trips/${tripId}/bookings`, rest);
      if (expenseId) await http.post(`/trips/${tripId}/expenses/${expenseId}/link-booking`, { bookingId: b.id }).catch(() => undefined);
    });
  });
}

export function deletedActivity(a: ActivityDto) {
  undoToast(t.undo.deleted(a.title), () => {
    const { id: _i, version: _v, createdAt: _c, updatedAt: _u, tripId: _t, sortOrder: _s, createdBy: _cb, updatedBy: _ub, ...rest } = a;
    tripStore.activities.create(rest);
  });
}

export function deletedPlace(p: PlaceDto) {
  undoToast(t.undo.deleted(p.name), () => {
    const { id: _i, version: _v, createdAt: _c, updatedAt: _u, tripId: _t, createdBy: _cb, votes: _vo, ...rest } = p as PlaceDto & Record<string, unknown>;
    tripStore.places.create(rest as Parameters<typeof tripStore.places.create>[0]);
  });
}
