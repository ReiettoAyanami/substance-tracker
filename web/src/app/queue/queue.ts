import { DestroyRef, Injectable, InjectionToken, effect, inject, signal, untracked } from '@angular/core';
import { App } from '@capacitor/app';
import { Observable, firstValueFrom } from 'rxjs';

import { RUNS_IN_APP } from '../connection/address';
import { Compatibility } from '../connection/compatibility';
import { Connectivity } from '../connection/connectivity';
import { ServerAddress } from '../connection/server-address';
import { ApiError, isUnreachable } from '../data/api-error';
import { LedgerApi } from '../data/ledger-api';
import { Session } from '../session/session';
import { onStore } from '../storage/app-db';
import { QueuedConsumption } from './queued-consumption';

/** Where the queue lives: the WebView's IndexedDB in the app; tests use a Map. */
export interface QueueBackend {
  all(): Promise<QueuedConsumption[]>;
  put(item: QueuedConsumption): Promise<void>;
  remove(clientRef: string): Promise<void>;
  clear(): Promise<void>;
}

class IndexedDbQueue implements QueueBackend {
  all(): Promise<QueuedConsumption[]> {
    return onStore('queue', 'readonly', (store) => store.getAll() as IDBRequest<QueuedConsumption[]>);
  }

  async put(item: QueuedConsumption): Promise<void> {
    await onStore('queue', 'readwrite', (store) => store.put(item, item.clientRef));
  }

  async remove(clientRef: string): Promise<void> {
    await onStore('queue', 'readwrite', (store) => store.delete(clientRef));
  }

  async clear(): Promise<void> {
    await onStore('queue', 'readwrite', (store) => store.clear());
  }
}

export const QUEUE_BACKEND = new InjectionToken<QueueBackend>('QUEUE_BACKEND', { factory: () => new IndexedDbQueue() });

/** Refused by the server for a reason of the data: the consumption goes to "To fix". */
const TO_FIX = new Set([400, 404, 409, 422]);

/**
 * The Android app's queue of consumptions (design-android.md, "queue (Pending)", "To fix"): the
 * consumptions recorded without an answer from the server, sent only while the app is open (at
 * launch, when the server answers again, at every return to the app, after one is recorded), one at a
 * time in the order they were recorded. Accepted, a consumption leaves the queue; refused for a reason
 * of the data, it goes to "To fix" with the server's reason; not sent (no answer, 429, 5xx) it stays;
 * 401, the user signs in again and the queue waits. It belongs to one user on one server and is
 * never sent with another's session. Nothing is moved or lost silently.
 */
@Injectable({
  providedIn: 'root',
})
export class Queue {
  private readonly backend = inject(QUEUE_BACKEND);
  private readonly inApp = inject(RUNS_IN_APP);
  private readonly server = inject(ServerAddress);
  private readonly session = inject(Session);
  private readonly ledger = inject(LedgerApi);
  private readonly connectivity = inject(Connectivity);
  private readonly compatibility = inject(Compatibility);
  private readonly itemsState = signal<QueuedConsumption[]>([]);
  private readonly sentState = signal(0);
  private sending: Promise<void> | null = null;

  /** The queue of this server and user, in the order recorded: Pending and To fix. */
  readonly items = this.itemsState.asReadonly();
  /** How many were accepted so far: the lists ask the server again when it moves. */
  readonly sent = this.sentState.asReadonly();

  constructor() {
    if (!this.inApp) return;
    // Another user or server: its own queue, and a try to send it.
    effect(() => {
      this.session.user();
      this.server.address();
      untracked(() => void this.load().then(() => this.send()));
    });
    // The versions agree again (an update).
    effect(() => {
      if (!this.compatibility.blocked()) untracked(() => void this.send());
    });
    // The server answers again.
    let wasOffline = false;
    effect(() => {
      const offline = this.connectivity.offline();
      if (wasOffline && !offline) untracked(() => void this.send());
      wasOffline = offline;
    });
    const resume = App.addListener('resume', () => void this.send());
    inject(DestroyRef).onDestroy(() => void resume.then((handle) => handle.remove()));
  }

  /** A consumption recorded without an answer: into the queue, then a try to send it. */
  async record(request: QueuedConsumption['request'], shown: QueuedConsumption['shown']): Promise<QueuedConsumption> {
    const user = this.session.user();
    const server = this.server.address();
    if (!user || !server) throw new Error('No user or server to queue a consumption for');
    const item: QueuedConsumption = {
      v: 1,
      clientRef: request.body.clientRef,
      server,
      userId: user.id,
      recordedAt: new Date().toISOString(),
      state: 'pending',
      reason: null,
      request,
      shown,
    };
    await this.backend.put(item);
    await this.load();
    void this.send();
    return item;
  }

  /** The user discards it, from its ⋮ (Pending), or as a choice of To fix. */
  async discard(clientRef: string): Promise<void> {
    await this.backend.remove(clientRef);
    await this.load();
  }

  /** Everything queued on the phone: at sign out, after the user was told what it loses. */
  async wipe(): Promise<void> {
    if (!this.inApp) return;
    await this.backend.clear();
    this.itemsState.set([]);
  }

  /** Sends the Pending consumptions, one at a time, in the order recorded. One run at a time. */
  send(): Promise<void> {
    if (!this.inApp) return Promise.resolve();
    this.sending ??= this.run().finally(() => (this.sending = null));
    return this.sending;
  }

  private async run(): Promise<void> {
    await this.load();
    // Another API level: nothing is sent until the app (or the server) is updated.
    if (this.compatibility.blocked()) return;
    for (const item of this.itemsState().filter((queued) => queued.state === 'pending')) {
      // Only with its own user's session (another may have signed in meanwhile).
      if (this.session.user()?.id !== item.userId || this.server.address() !== item.server) return;
      try {
        const sent: Observable<unknown> =
          item.request.kind === 'batch'
            ? this.ledger.createConsumption(item.request.batchId, item.request.body)
            : this.ledger.createOneTime(item.request.substanceId, item.request.body);
        await firstValueFrom(sent);
        await this.backend.remove(item.clientRef);
        this.sentState.update((count) => count + 1);
      } catch (failure) {
        const error = failure as ApiError;
        if (error.status !== null && TO_FIX.has(error.status) && !isUnreachable(error)) {
          await this.backend.put({ ...item, state: 'to-fix', reason: error.detail || error.title });
          continue;
        }
        // No answer, 401 (sign in again), 429 or 5xx: the queue waits, in its order.
        break;
      }
    }
    await this.load();
  }

  private async load(): Promise<void> {
    const user = this.session.user();
    const server = this.server.address();
    if (!this.inApp || !user || !server) {
      this.itemsState.set([]);
      return;
    }
    let all: QueuedConsumption[] = [];
    try {
      all = await this.backend.all();
    } catch {
      // Storage refused: nothing shown, nothing lost.
    }
    this.itemsState.set(
      all
        .filter((item) => item.v === 1 && item.server === server && item.userId === user.id)
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)),
    );
  }
}
