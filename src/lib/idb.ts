/**
 * Minimal promise wrapper around IndexedDB (no dependency).
 * Stores: snapshots (per trip), queue (pending sync operations), meta.
 */
const DB_NAME = 'travio';
const DB_VERSION = 1;
export type StoreName = 'snapshots' | 'queue' | 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots');
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'opId' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => (dbPromise = null));
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const req = fn(transaction.objectStore(store));
        transaction.oncomplete = () => resolve(req ? req.result : undefined);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

export const idb = {
  get: <T>(store: StoreName, key: IDBValidKey) => tx<T>(store, 'readonly', (s) => s.get(key) as IDBRequest<T>).catch(() => undefined),
  getAll: <T>(store: StoreName) => tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>).then((r) => r ?? []).catch(() => [] as T[]),
  put: (store: StoreName, value: unknown, key?: IDBValidKey) => tx(store, 'readwrite', (s) => s.put(value, key)).catch(() => undefined),
  delete: (store: StoreName, key: IDBValidKey) => tx(store, 'readwrite', (s) => s.delete(key)).catch(() => undefined),
  clearAll: async () => {
    for (const s of ['snapshots', 'queue', 'meta'] as StoreName[]) await tx(s, 'readwrite', (st) => st.clear()).catch(() => undefined);
  },
};
