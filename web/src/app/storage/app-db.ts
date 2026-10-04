/**
 * The Android app's own database on the phone (design-android.md, "last data", "queue"): the
 * WebView's IndexedDB, in the app's private storage, never backed up. One store per kind of data;
 * a version up adds stores and never drops one, so a newer app always opens an older phone's data.
 */
const NAME = 'substance-tracker';
const VERSION = 2;

/** 1: the last data (2.7). 2: the queue of consumptions (2.8). */
export type AppStore = 'last-data' | 'queue';
const STORES: readonly AppStore[] = ['last-data', 'queue'];

let opened: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, VERSION);
    request.onupgradeneeded = () => {
      for (const store of STORES) {
        if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opened = null;
      reject(request.error);
    };
  });
  return opened;
}

/** One request on one store, as a promise. */
export async function onStore<T>(store: AppStore, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = work(db.transaction(store, mode).objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
