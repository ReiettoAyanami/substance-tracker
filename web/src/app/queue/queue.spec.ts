import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';

import { RUNS_IN_APP } from '../connection/address';
import { Compatibility } from '../connection/compatibility';
import { ServerAddress } from '../connection/server-address';
import { errorInterceptor } from '../data/error-interceptor';
import { Session } from '../session/session';
import { QUEUE_BACKEND, Queue, QueueBackend } from './queue';
import { QueuedConsumption } from './queued-consumption';

vi.mock('@capacitor/app', () => ({ App: { addListener: () => Promise.resolve({ remove: () => undefined }) } }));

class MemoryQueue implements QueueBackend {
  readonly map = new Map<string, QueuedConsumption>();
  async all() {
    return [...this.map.values()];
  }
  async put(item: QueuedConsumption) {
    this.map.set(item.clientRef, item);
  }
  async remove(clientRef: string) {
    this.map.delete(clientRef);
  }
  async clear() {
    this.map.clear();
  }
}

const REF = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const shown = { substanceId: 2, substanceName: 'Sigarette', unit: 'sigaretta', batchName: 'Pack A' };

describe('Queue', () => {
  const blocked = signal(false);
  let queue: Queue;
  let backend: HttpTestingController;
  let phone: MemoryQueue;
  const user = signal<{ id: number } | null>({ id: 7 });

  function setUp(inApp = true): void {
    phone = new MemoryQueue();
    user.set({ id: 7 });
    blocked.set(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: RUNS_IN_APP, useValue: inApp },
        { provide: QUEUE_BACKEND, useValue: phone },
        { provide: Session, useValue: { user } },
        { provide: Compatibility, useValue: { blocked } },
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(ServerAddress).set('https://tracker.example.com');
    queue = TestBed.inject(Queue);
    backend = TestBed.inject(HttpTestingController);
  }

  /** Lets the queue's promises run (the storage, the next send). */
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
  };

  const record = (n: number, quantity = '1') =>
    queue.record({ kind: 'batch', batchId: 8, body: { quantity, occurredAt: `2026-10-04T10:0${n}:00Z`, clientRef: REF(n) } }, shown);

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  it('keeps what was recorded, with its time and clientRef, and sends it: accepted, it leaves the queue', async () => {
    setUp();
    TestBed.tick();
    await settle();
    const item = await record(1, '2.5');
    expect(item).toMatchObject({ v: 1, clientRef: REF(1), server: 'https://tracker.example.com', userId: 7, state: 'pending' });
    expect(queue.items().map((i) => i.clientRef)).toEqual([REF(1)]);
    await settle();
    const sent = backend.expectOne('/api/batches/8/consumptions');
    expect(sent.request.body).toEqual({ quantity: '2.5', occurredAt: '2026-10-04T10:01:00Z', clientRef: REF(1) });
    sent.flush({ id: 90 }, { status: 201, statusText: 'Created' });
    await settle();
    expect(queue.items()).toEqual([]);
    expect(queue.sent()).toBe(1);
  });

  it('sends one at a time in the order recorded; refused for a reason of the data, To fix with the reason', async () => {
    setUp();
    TestBed.tick();
    await settle();
    // Recorded while nothing answers: the first send gets no answer, and both wait.
    await record(1);
    await settle();
    backend.expectOne('/api/batches/8/consumptions').error(new ProgressEvent('error'));
    await settle();
    await record(2);
    await settle();
    const first = backend.expectOne('/api/batches/8/consumptions');
    expect(first.request.body.clientRef).toBe(REF(1));
    first.flush(
      { type: 'urn:substance-tracker:problem:batch-deactivated', title: 'Conflict', status: 409, detail: 'Batch 8 is finished', errors: [] },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    const second = backend.expectOne('/api/batches/8/consumptions');
    expect(second.request.body.clientRef).toBe(REF(2));
    second.flush({ id: 91 }, { status: 201, statusText: 'Created' });
    await settle();
    expect(queue.items()).toEqual([expect.objectContaining({ clientRef: REF(1), state: 'to-fix', reason: 'Batch 8 is finished' })]);
  });

  it('no answer, 401, 429 or 5xx: it stays Pending, and nothing after it is sent', async () => {
    setUp();
    TestBed.tick();
    await settle();
    for (const status of [502, 401, 429, 500]) {
      await record(1);
      await settle();
      backend.expectOne('/api/batches/8/consumptions').flush(null, { status, statusText: 'x' });
      await settle();
      expect(queue.items()).toEqual([expect.objectContaining({ clientRef: REF(1), state: 'pending' })]);
    }
  });

  it("never sends with another user's session, nor shows another user's queue", async () => {
    setUp();
    TestBed.tick();
    await settle();
    await phone.put({ ...(await record(1)), userId: 8 });
    await settle();
    backend.match('/api/batches/8/consumptions').forEach((req) => req.flush(null, { status: 502, statusText: 'x' }));
    await queue.send();
    await settle();
    backend.expectNone('/api/batches/8/consumptions');
    expect(queue.items()).toEqual([]);
  });

  it('discards one, and wipes them all', async () => {
    setUp();
    TestBed.tick();
    await settle();
    await record(1);
    await settle();
    backend.expectOne('/api/batches/8/consumptions').error(new ProgressEvent('error'));
    await settle();
    await queue.discard(REF(1));
    expect(queue.items()).toEqual([]);
    expect(phone.map.size).toBe(0);
    await phone.put({ ...(await record(2)) });
    await settle();
    backend.match('/api/batches/8/consumptions').forEach((req) => req.error(new ProgressEvent('error')));
    await queue.wipe();
    expect(phone.map.size).toBe(0);
  });

  it('while app and server differ in API level, nothing is sent; once they agree, the queue goes', async () => {
    setUp();
    blocked.set(true);
    TestBed.tick();
    await settle();
    await record(1);
    await settle();
    backend.expectNone('/api/batches/8/consumptions');
    blocked.set(false);
    TestBed.tick();
    await settle();
    backend.expectOne('/api/batches/8/consumptions').flush({ id: 92 }, { status: 201, statusText: 'Created' });
    await settle();
    expect(queue.items()).toEqual([]);
  });

  it('the website has no queue', async () => {
    setUp(false);
    await queue.send();
    expect(queue.items()).toEqual([]);
  });
});
