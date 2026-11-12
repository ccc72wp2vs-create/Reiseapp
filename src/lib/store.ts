/**
 * Offline-first trip store.
 *
 *  server  – last known server state of the selected trip (persisted in IndexedDB)
 *  pending – queued mutations (persisted), each with a stable opId
 *  view    – server state with pending mutations applied optimistically
 *
 * Activities, saved places and packing lists/items are edited through the
 * queue (works offline). Everything else uses direct API calls and is
 * disabled while offline.
 */
import { useSyncExternalStore } from 'react';
import type {
  ActivityDto,
  PackingItemDto,
  PackingListDto,
  PlaceDto,
  SyncEntity,
  SyncOperation,
  SyncResult,
  TripSnapshot,
  TripSummaryDto,
} from '../../shared/types';
import { t } from '../i18n';
import { ApiError, errorMessage, http } from './api';
import { idb } from './idb';

export interface QueuedOp extends SyncOperation {
  tripId: string;
  createdAt: string;
}
export interface SyncConflict {
  op: QueuedOp;
  server: Record<string, unknown> | null;
}
export interface SyncFailure {
  op: QueuedOp;
  message: string;
}

export interface TripState {
  tripId: string | null;
  server: TripSnapshot | null;
  view: TripSnapshot | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  fromCache: boolean;
  syncing: boolean;
  pending: QueuedOp[];
  conflicts: SyncConflict[];
  failures: SyncFailure[];
  lastSyncedAt: string | null;
}

// ---------------------------------------------------------------------------
// Tiny observable
// ---------------------------------------------------------------------------

function createStore<S>(initial: S) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<S> | ((s: S) => Partial<S>)) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

// ---------------------------------------------------------------------------
// Connectivity
// ---------------------------------------------------------------------------

const onlineStore = createStore({ online: typeof navigator === 'undefined' ? true : navigator.onLine });
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    onlineStore.set({ online: true });
    void tripStore.refresh();
  });
  window.addEventListener('offline', () => onlineStore.set({ online: false }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && onlineStore.get().online) void tripStore.refresh({ quiet: true });
  });
}
export const isOnline = () => onlineStore.get().online;
export function useOnline() {
  return useSyncExternalStore(onlineStore.subscribe, () => onlineStore.get().online);
}

// ---------------------------------------------------------------------------
// Trips list
// ---------------------------------------------------------------------------

const tripsStore = createStore<{ trips: TripSummaryDto[] | null; loading: boolean; error: string | null }>({
  trips: null,
  loading: false,
  error: null,
});

export const tripsList = {
  async load() {
    if (!tripsStore.get().trips) {
      const cached = await idb.get<TripSummaryDto[]>('meta', 'trips');
      if (cached) tripsStore.set({ trips: cached });
    }
    tripsStore.set({ loading: true, error: null });
    try {
      const { trips } = await http.get<{ trips: TripSummaryDto[] }>('/trips');
      tripsStore.set({ trips, loading: false });
      await idb.put('meta', trips, 'trips');
      return trips;
    } catch (e) {
      tripsStore.set({ loading: false, error: tripsStore.get().trips ? null : errorMessage(e) });
      return tripsStore.get().trips ?? [];
    }
  },
};
export function useTrips() {
  return useSyncExternalStore(tripsStore.subscribe, tripsStore.get);
}

// ---------------------------------------------------------------------------
// Selected trip
// ---------------------------------------------------------------------------

const SELECTED_KEY = 'travio.selectedTrip';
export function getSelectedTripId(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}
function rememberTrip(id: string | null) {
  try {
    if (id) localStorage.setItem(SELECTED_KEY, id);
    else localStorage.removeItem(SELECTED_KEY);
  } catch {
    /* storage unavailable */
  }
}

const store = createStore<TripState>({
  tripId: null,
  server: null,
  view: null,
  status: 'idle',
  error: null,
  fromCache: false,
  syncing: false,
  pending: [],
  conflicts: [],
  failures: [],
  lastSyncedAt: null,
});

export function useTripState() {
  return useSyncExternalStore(store.subscribe, store.get);
}

/** Current trip snapshot (with optimistic changes). */
export function useSnapshot() {
  return useTripState().view;
}

// ---------------------------------------------------------------------------
// Applying operations locally
// ---------------------------------------------------------------------------

type Collection = 'activities' | 'places' | 'packingLists' | 'packingItems';
const COLLECTION: Record<SyncEntity, Collection> = {
  activity: 'activities',
  place: 'places',
  packing_list: 'packingLists',
  packing_item: 'packingItems',
};

const DEFAULTS: Record<SyncEntity, Record<string, unknown>> = {
  activity: {
    description: null,
    category: 'other',
    startTime: null,
    endTime: null,
    locationName: null,
    lat: null,
    lng: null,
    estCostMinor: null,
    currency: null,
    bookingStatus: 'planned',
    completed: false,
    notes: null,
    placeId: null,
    sortOrder: 9999,
    createdBy: null,
    updatedBy: null,
  },
  place: {
    category: 'other',
    description: null,
    address: null,
    lat: null,
    lng: null,
    externalUrl: null,
    notes: null,
    favorite: false,
    destinationId: null,
    createdBy: null,
  },
  packing_list: { visibility: 'private', isTemplate: false, ownerUserId: '' },
  packing_item: { category: 'other', quantity: 1, packed: false, sortOrder: 9999 },
};

function applyOps(server: TripSnapshot, ops: QueuedOp[]): TripSnapshot {
  if (!ops.length) return server;
  const next: TripSnapshot = {
    ...server,
    activities: [...server.activities],
    places: [...server.places],
    packingLists: [...server.packingLists],
    packingItems: [...server.packingItems],
  };
  for (const op of ops) {
    const key = COLLECTION[op.entity];
    const list = next[key] as unknown as Record<string, unknown>[];
    const idx = list.findIndex((x) => x.id === op.id);
    if (op.action === 'create' && idx === -1) {
      const now = op.createdAt;
      list.push({
        ...DEFAULTS[op.entity],
        ...op.data,
        id: op.id,
        tripId: server.trip.id,
        version: 0,
        createdAt: now,
        updatedAt: now,
        ...(op.entity === 'packing_list' ? { tripId: op.data?.isTemplate ? null : server.trip.id } : {}),
      });
    } else if (op.action === 'update' && idx >= 0) {
      list[idx] = { ...list[idx], ...op.data };
    } else if (op.action === 'delete' && idx >= 0) {
      list.splice(idx, 1);
      if (op.entity === 'packing_list') next.packingItems = next.packingItems.filter((i) => i.listId !== op.id);
    } else if (op.action === 'reorder' && op.entity === 'activity') {
      const ids = (op.data?.orderedIds as string[]) ?? [];
      for (let i = 0; i < list.length; i++) {
        const pos = ids.indexOf(list[i].id as string);
        if (pos >= 0) list[i] = { ...list[i], sortOrder: pos };
      }
    }
  }
  next.activities.sort((a, b) => a.date.localeCompare(b.date) || a.sortOrder - b.sortOrder);
  return next;
}

function recompute(patch: Partial<TripState> = {}) {
  const s = { ...store.get(), ...patch };
  const ops = s.pending.filter((o) => o.tripId === s.tripId);
  const view = s.server ? applyOps(s.server, ops) : null;
  store.set({ ...patch, view });
}

function upsertServerEntity(entity: SyncEntity, value: Record<string, unknown> | null, id: string) {
  const s = store.get();
  if (!s.server) return;
  const key = COLLECTION[entity];
  const list = [...(s.server[key] as unknown as Record<string, unknown>[])];
  const idx = list.findIndex((x) => x.id === id);
  if (value === null) {
    if (idx >= 0) list.splice(idx, 1);
  } else if (idx >= 0) list[idx] = value;
  else list.push(value);
  const server = { ...s.server, [key]: list } as TripSnapshot;
  if (entity === 'packing_list' && value === null) server.packingItems = server.packingItems.filter((i) => i.listId !== id);
  store.set({ server });
}

// ---------------------------------------------------------------------------
// Sync engine
// ---------------------------------------------------------------------------

const inflight = new Set<string>();
let flushing: Promise<void> | null = null;

async function persistQueue(op: QueuedOp, remove = false) {
  if (remove) await idb.delete('queue', op.opId);
  else await idb.put('queue', op);
}

async function persistServer() {
  const s = store.get();
  if (s.server && s.tripId) await idb.put('snapshots', { snapshot: s.server, savedAt: new Date().toISOString() }, s.tripId);
}

async function handleResult(op: QueuedOp, r: SyncResult) {
  const s = store.get();
  const pending = s.pending.filter((p) => p.opId !== op.opId);
  await persistQueue(op, true);
  if (r.status === 'applied' || r.status === 'duplicate') {
    if (op.action !== 'reorder') {
      const entity = (r.entity ?? null) as Record<string, unknown> | null;
      upsertServerEntity(op.entity, op.action === 'delete' ? null : entity, op.id);
      // Later queued changes of the same entity were based on our own change.
      if (entity && typeof entity.version === 'number') {
        const prevBase = op.action === 'create' ? undefined : op.baseVersion;
        for (const p of pending) {
          if (p.id === op.id && p.entity === op.entity && (p.baseVersion === prevBase || (op.action === 'create' && p.baseVersion === 1))) {
            p.baseVersion = entity.version as number;
            await persistQueue(p);
          }
        }
      }
    }
    recompute({ pending });
  } else if (r.status === 'conflict') {
    const server = (r.entity ?? null) as Record<string, unknown> | null;
    upsertServerEntity(op.entity, server, op.id);
    recompute({ pending, conflicts: [...store.get().conflicts, { op, server }] });
  } else {
    recompute({ pending, failures: [...store.get().failures, { op, message: r.error?.message ?? t.errors.generic }] });
  }
}

async function doFlush() {
  for (;;) {
    const s = store.get();
    if (!s.tripId || !isOnline()) return;
    const batch = s.pending.filter((o) => o.tripId === s.tripId && !inflight.has(o.opId)).slice(0, 50);
    if (!batch.length) return;
    batch.forEach((o) => inflight.add(o.opId));
    store.set({ syncing: true });
    try {
      const { results } = await http.post<{ results: SyncResult[] }>(`/trips/${s.tripId}/sync`, {
        ops: batch.map(({ opId, entity, action, id, baseVersion, data, clientTime }) => ({ opId, entity, action, id, baseVersion, data, clientTime })),
      });
      for (const op of batch) {
        const r = results.find((x) => x.opId === op.opId);
        if (r) await handleResult(op, r);
      }
      store.set({ lastSyncedAt: new Date().toISOString() });
      await persistServer();
      // Server-side side effects (e.g. items copied from a template) need a fresh snapshot.
      if (batch.some((o) => o.entity === 'packing_list' && o.action === 'create' && o.data?.fromListId)) {
        void tripStore.refresh({ quiet: true });
      }
    } catch (e) {
      // Network problems keep the queue; permission/validation problems of
      // the whole request are surfaced but also keep the ops for retry.
      if (!(e instanceof ApiError) || !e.isNetwork) {
        store.set({ error: errorMessage(e) });
      }
      return;
    } finally {
      batch.forEach((o) => inflight.delete(o.opId));
      store.set({ syncing: false });
    }
  }
}

function flush(): Promise<void> {
  if (!flushing) {
    flushing = doFlush().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

function enqueue(op: Omit<QueuedOp, 'opId' | 'tripId' | 'createdAt'>) {
  const s = store.get();
  if (!s.tripId) return;
  // Coalesce with a not-yet-sent op for the same entity to keep the queue short.
  const existing = [...s.pending].reverse().find((p) => p.tripId === s.tripId && p.entity === op.entity && p.id === op.id && !inflight.has(p.opId));
  let pending = [...s.pending];
  if (existing && op.action === 'update' && (existing.action === 'create' || existing.action === 'update')) {
    const merged = { ...existing, data: { ...existing.data, ...op.data } };
    pending = pending.map((p) => (p.opId === existing.opId ? merged : p));
    void persistQueue(merged);
  } else if (existing && op.action === 'delete' && existing.action === 'create') {
    pending = pending.filter((p) => !(p.entity === op.entity && p.id === op.id));
    void persistQueue(existing, true);
  } else {
    const full: QueuedOp = { ...op, opId: crypto.randomUUID(), tripId: s.tripId, createdAt: new Date().toISOString(), clientTime: new Date().toISOString() };
    pending.push(full);
    void persistQueue(full);
  }
  recompute({ pending });
  if (isOnline()) void flush();
}

function serverVersion(entity: SyncEntity, id: string): number | undefined {
  const s = store.get().server;
  if (!s) return undefined;
  const list = s[COLLECTION[entity]] as unknown as { id: string; version: number }[];
  return list.find((x) => x.id === id)?.version;
}

function queueUpdate(entity: SyncEntity, id: string, data: Record<string, unknown>) {
  enqueue({ entity, action: 'update', id, baseVersion: serverVersion(entity, id) ?? 1, data });
}
function queueDelete(entity: SyncEntity, id: string) {
  enqueue({ entity, action: 'delete', id, baseVersion: serverVersion(entity, id) });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let loadSeq = 0;

export const tripStore = {
  get: store.get,

  async select(tripId: string | null) {
    rememberTrip(tripId);
    if (!tripId) {
      store.set({ tripId: null, server: null, view: null, status: 'idle', error: null });
      return;
    }
    if (store.get().tripId === tripId && store.get().server) return;
    const seq = ++loadSeq;
    store.set({ tripId, server: null, view: null, status: 'loading', error: null, fromCache: false, conflicts: [], failures: [] });
    const [cached, queue] = await Promise.all([
      idb.get<{ snapshot: TripSnapshot; savedAt: string }>('snapshots', tripId),
      idb.getAll<QueuedOp>('queue'),
    ]);
    if (seq !== loadSeq) return;
    const pending = queue.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (cached) recompute({ server: cached.snapshot, pending, status: 'ready', fromCache: true, lastSyncedAt: cached.savedAt });
    else store.set({ pending });
    await tripStore.refresh();
  },

  async refresh(opts: { quiet?: boolean } = {}) {
    const s = store.get();
    if (!s.tripId) return;
    if (!isOnline()) {
      if (!s.server) store.set({ status: 'error', error: t.offline.banner });
      return;
    }
    const tripId = s.tripId;
    try {
      await flush();
      const snapshot = await http.get<TripSnapshot>(`/trips/${tripId}/snapshot`);
      if (store.get().tripId !== tripId) return;
      recompute({ server: snapshot, status: 'ready', error: null, fromCache: false, lastSyncedAt: snapshot.syncedAt });
      await persistServer();
    } catch (e) {
      if (store.get().tripId !== tripId) return;
      if (e instanceof ApiError && e.status === 404) {
        await idb.delete('snapshots', tripId);
        rememberTrip(null);
        store.set({ status: 'error', error: t.errors.notFound, server: null, view: null });
        return;
      }
      if (!store.get().server) store.set({ status: 'error', error: errorMessage(e) });
      else if (!opts.quiet) store.set({ fromCache: true });
    }
  },

  flush,

  /** Runs an online-only mutation and refreshes the snapshot afterwards. */
  async mutate<T>(fn: () => Promise<T>): Promise<T> {
    if (!isOnline()) throw new ApiError(0, 'offline', t.errors.offlineAction);
    try {
      const result = await fn();
      await tripStore.refresh({ quiet: true });
      return result;
    } catch (e) {
      if (e instanceof ApiError && e.isConflict) await tripStore.refresh({ quiet: true });
      throw e;
    }
  },

  resolveConflict(conflict: SyncConflict, keep: 'mine' | 'theirs') {
    const s = store.get();
    store.set({ conflicts: s.conflicts.filter((c) => c.op.opId !== conflict.op.opId) });
    if (keep === 'theirs' || !conflict.server) return;
    const version = conflict.server.version as number;
    enqueue({ entity: conflict.op.entity, action: conflict.op.action, id: conflict.op.id, baseVersion: version, data: conflict.op.data });
  },

  dismissFailures() {
    store.set({ failures: [] });
  },

  async clearLocal() {
    await idb.clearAll();
    rememberTrip(null);
    store.set({ tripId: null, server: null, view: null, pending: [], conflicts: [], failures: [], status: 'idle' });
    tripsStore.set({ trips: null });
  },

  // Offline-capable entity operations ---------------------------------------

  activities: {
    create(data: Partial<ActivityDto> & { title: string; date: string }) {
      const id = crypto.randomUUID();
      enqueue({ entity: 'activity', action: 'create', id, data });
      return id;
    },
    update: (id: string, data: Partial<ActivityDto>) => queueUpdate('activity', id, data),
    remove: (id: string) => queueDelete('activity', id),
    reorder(date: string, orderedIds: string[]) {
      enqueue({ entity: 'activity', action: 'reorder', id: orderedIds[0], data: { date, orderedIds } });
    },
  },
  places: {
    create(data: Partial<PlaceDto> & { name: string }) {
      const id = crypto.randomUUID();
      enqueue({ entity: 'place', action: 'create', id, data });
      return id;
    },
    update: (id: string, data: Partial<PlaceDto>) => queueUpdate('place', id, data),
    remove: (id: string) => queueDelete('place', id),
  },
  packing: {
    createList(data: Partial<PackingListDto> & { name: string; fromListId?: string }) {
      const id = crypto.randomUUID();
      enqueue({ entity: 'packing_list', action: 'create', id, data });
      return id;
    },
    updateList: (id: string, data: Partial<PackingListDto>) => queueUpdate('packing_list', id, data),
    removeList: (id: string) => queueDelete('packing_list', id),
    createItem(data: Partial<PackingItemDto> & { listId: string; name: string }) {
      const id = crypto.randomUUID();
      enqueue({ entity: 'packing_item', action: 'create', id, data });
      return id;
    },
    updateItem: (id: string, data: Partial<PackingItemDto>) => queueUpdate('packing_item', id, data),
    removeItem: (id: string) => queueDelete('packing_item', id),
  },
};

/** IDs of entities with unsynchronized local changes. */
export function usePendingIds(): Set<string> {
  const s = useTripState();
  return new Set(s.pending.filter((p) => p.tripId === s.tripId).map((p) => p.id));
}
