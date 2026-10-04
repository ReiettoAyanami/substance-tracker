import { Injectable, InjectionToken, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { RUNS_IN_APP } from '../connection/address';
import { ServerAddress } from '../connection/server-address';
import { CatalogApi } from '../data/catalog-api';
import { ReportsApi } from '../data/reports-api';
import { SettingsApi } from '../data/settings-api';

/**
 * One stored answer (design-android.md, "last data"): what the server answered and when. `v` is the
 * format: every later app version reads the older ones ("No update loses a queued consumption").
 */
export interface StoredAnswer {
  v: 1;
  /** When the server gave it (ISO 8601). */
  at: string;
  body: unknown;
}

/** Where the answers live: the WebView's IndexedDB in the app (private, never backed up); tests use a Map. */
export interface LastDataBackend {
  get(key: string): Promise<StoredAnswer | undefined>;
  put(key: string, answer: StoredAnswer): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'substance-tracker';
const STORE = 'last-data';

/** IndexedDB, one object store keyed by server, user and request. */
class IndexedDbBackend implements LastDataBackend {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.db;
  }

  private async run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  get(key: string): Promise<StoredAnswer | undefined> {
    return this.run('readonly', (store) => store.get(key) as IDBRequest<StoredAnswer | undefined>);
  }

  async put(key: string, answer: StoredAnswer): Promise<void> {
    await this.run('readwrite', (store) => store.put(answer, key));
  }

  async clear(): Promise<void> {
    await this.run('readwrite', (store) => store.clear());
  }
}

export const LAST_DATA_BACKEND = new InjectionToken<LastDataBackend>('LAST_DATA_BACKEND', {
  factory: () => new IndexedDbBackend(),
});

/**
 * The Android app's last data (design-android.md, "last data"): for every read, the last answer the
 * server gave, per server and per user, shown when the app is offline. Never a copy or a sync of the
 * database, never computed into anything new; wiped at sign out and at a change of server.
 */
@Injectable({
  providedIn: 'root',
})
export class LastData {
  private readonly backend = inject(LAST_DATA_BACKEND);
  private readonly server = inject(ServerAddress);
  private readonly inApp = inject(RUNS_IN_APP);
  private readonly catalog = inject(CatalogApi);
  private readonly reports = inject(ReportsApi);
  private readonly settings = inject(SettingsApi);

  /** The key of a read: its server, its user, and the request with its query (`/api/movements?limit=50`). */
  private keyOf(userId: number, request: string): string | null {
    const server = this.server.address();
    return server ? `${server}|${userId}|${request}` : null;
  }

  async read(userId: number, request: string): Promise<StoredAnswer | undefined> {
    const key = this.keyOf(userId, request);
    if (!key) return undefined;
    try {
      const stored = await this.backend.get(key);
      return stored?.v === 1 ? stored : undefined;
    } catch {
      return undefined;
    }
  }

  async write(userId: number, request: string, body: unknown, at: string): Promise<void> {
    const key = this.keyOf(userId, request);
    if (!key) return;
    try {
      await this.backend.put(key, { v: 1, at, body });
    } catch {
      // Storage full or refused: this read is not kept, the next one tries again.
    }
  }

  /** Everything the phone keeps of its server: at sign out and at "Change server". */
  async wipe(): Promise<void> {
    if (!this.inApp) return;
    try {
      await this.backend.clear();
    } catch {
      // Nothing stored.
    }
  }

  /**
   * At launch, online and signed in: what recording a consumption offline needs, even when its pages
   * are not opened (substances, their active batches, the settings). The reads store themselves.
   */
  async refreshForOffline(): Promise<void> {
    if (!this.inApp) return;
    try {
      await firstValueFrom(this.settings.getSettings());
      const substances = await firstValueFrom(this.catalog.listSubstances());
      await Promise.all(substances.map((substance) => firstValueFrom(this.reports.getSubstanceBatches(substance.id))));
    } catch {
      // Offline or refused: what was stored before stays.
    }
  }
}
