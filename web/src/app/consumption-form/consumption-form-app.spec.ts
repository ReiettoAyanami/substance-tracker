import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

import { RUNS_IN_APP } from '../connection/address';
import { Connectivity } from '../connection/connectivity';
import { ServerAddress } from '../connection/server-address';
import { errorInterceptor } from '../data/error-interceptor';
import { Substance } from '../data/substance';
import { SubstanceBatches, Batch } from '../data/substance-batches';
import { QUEUE_BACKEND, QueueBackend } from '../queue/queue';
import { QueuedConsumption } from '../queue/queued-consumption';
import { Session } from '../session/session';
import { ConsumptionForm } from './consumption-form';

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

const settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };
const substances = [{ id: 2, name: 'Sigarette', unit: 'sigaretta' }] as Substance[];
const packs: SubstanceBatches = {
  substanceId: 2,
  stock: '23.000',
  stockBarMax: '40.000',
  batches: [{ id: 8, name: 'Pack A', remaining: '3.000' }] as Batch[],
};

/** The consumption form in the Android app (design-android.md, "queue (Pending)"). */
describe('ConsumptionForm in the Android app', () => {
  let fixture: ComponentFixture<ConsumptionForm>;
  let backend: HttpTestingController;
  let phone: MemoryQueue;
  let said: unknown[];
  const element = () => fixture.nativeElement as HTMLElement;
  const input = (field: string) => element().querySelector<HTMLInputElement>(`[formControlName="${field}"]`)!;
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  };
  function request(url: string): TestRequest {
    TestBed.tick();
    return backend.expectOne(url);
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-05T18:15:30Z'));
    phone = new MemoryQueue();
    TestBed.configureTestingModule({
      imports: [ConsumptionForm],
      providers: [
        { provide: RUNS_IN_APP, useValue: true },
        { provide: QUEUE_BACKEND, useValue: phone },
        { provide: Session, useValue: { user: signal({ id: 7 }) } },
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    TestBed.inject(ServerAddress).set('https://tracker.example.com');
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  async function render(inputs: Record<string, unknown> = { substanceId: 2 }): Promise<void> {
    fixture = TestBed.createComponent(ConsumptionForm);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    said = [];
    fixture.componentInstance.saved.subscribe((saved) => said.push(saved));
    request('/api/settings').flush(settings);
    backend.expectOne('/api/substances').flush(substances);
    request('/api/substances/2/batches').flush(packs);
    await fixture.whenStable();
  }

  async function type(field: string, value: string): Promise<void> {
    input(field).value = value;
    input(field).dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  const save = () => element().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();

  it('offline, the consumption goes to the queue at the time the form shows, without asking the server', async () => {
    TestBed.inject(Connectivity).unanswered();
    await render();
    await type('quantity', '2');
    save();
    await settle();
    expect(said).toEqual([expect.objectContaining({ state: 'pending' })]);
    const [queued] = [...phone.map.values()];
    expect(queued).toMatchObject({
      request: { kind: 'batch', batchId: 8, body: { quantity: '2', occurredAt: '2026-09-05T18:15:00Z' } },
      shown: { substanceId: 2, substanceName: 'Sigarette', unit: 'sigaretta', batchName: 'Pack A' },
    });
    // The queue tries to send it: the server does not answer.
    backend.match('/api/batches/8/consumptions').forEach((req) => req.error(new ProgressEvent('error')));
  });

  it('a save without an answer goes to the queue with the same clientRef', async () => {
    await render();
    await type('quantity', '1');
    save();
    const sent = backend.expectOne('/api/batches/8/consumptions');
    const ref = sent.request.body.clientRef;
    sent.error(new ProgressEvent('error'));
    await settle();
    expect(said).toEqual([expect.objectContaining({ clientRef: ref, state: 'pending' })]);
    expect([...phone.map.keys()]).toEqual([ref]);
    backend.match('/api/batches/8/consumptions').forEach((req) => req.error(new ProgressEvent('error')));
  });

  it('a refusal of the server is shown as on the website, never queued', async () => {
    await render();
    await type('quantity', '30');
    save();
    backend
      .expectOne('/api/batches/8/consumptions')
      .flush({ type: 'urn:substance-tracker:problem:x', title: 'Conflict', status: 409, detail: 'too much', errors: [] }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(said).toEqual([]);
    expect(phone.map.size).toBe(0);
  });

  it('a To fix consumption opens filled in, its substance fixed', async () => {
    fixture = TestBed.createComponent(ConsumptionForm);
    fixture.componentRef.setInput('draft', {
      substanceId: 2,
      quantity: '1.500',
      occurredAt: '2026-09-04T07:30:00Z',
      note: 'at the bar',
      oneTime: true,
      totalPrice: '6.00',
      name: 'Bar',
    });
    request('/api/settings').flush(settings);
    backend.expectOne('/api/substances').flush(substances);
    request('/api/substances/2/batches').flush(packs);
    await fixture.whenStable();
    expect(input('quantity').value).toBe('1.5');
    expect(input('note').value).toBe('at the bar');
    expect(input('totalPrice').value).toBe('6');
    expect(input('name').value).toBe('Bar');
    expect(input('time').value).toBe('09:30');
  });
});
