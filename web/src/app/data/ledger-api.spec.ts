import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Observable, firstValueFrom } from 'rxjs';

import { BatchRecord } from './batch';
import { ConsumptionRecord } from './consumption';
import { LedgerApi } from './ledger-api';
import { OneTimeRecord } from './one-time';

describe('LedgerApi', () => {
  let api: LedgerApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(LedgerApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  /** Checks the one request `call` sends, answers it and returns what the caller receives. */
  async function send<T>(
    call: Observable<T>,
    expected: { method: string; url: string; body: unknown },
    answer: { body: object | null; status?: number },
  ): Promise<T> {
    const result = firstValueFrom(call);
    const req = backend.expectOne(expected.url);
    expect(req.request.method).toBe(expected.method);
    expect(req.request.body).toEqual(expected.body);
    req.flush(answer.body, { status: answer.status ?? 200, statusText: 'OK' });
    return result;
  }

  it('creates a batch of a substance, changes it and deletes it', async () => {
    const batch = { id: 7, substanceId: 2, name: 'Peroni', quantity: '6.000', totalPrice: '7.20' } as BatchRecord;
    const input = { name: 'Peroni', refills: '1', totalPrice: '7.20', occurredAt: '2026-09-30T18:00:00Z', note: null };
    expect(
      await send(api.createBatch(2, input), { method: 'POST', url: '/api/substances/2/batches', body: input }, { body: batch, status: 201 }),
    ).toEqual(batch);

    const change = { name: null, totalPrice: '7.50' };
    expect(await send(api.updateBatch(7, change), { method: 'PATCH', url: '/api/batches/7', body: change }, { body: batch })).toEqual(batch);

    expect(await send(api.deleteBatch(7), { method: 'DELETE', url: '/api/batches/7', body: null }, { body: null, status: 204 })).toBeNull();
  });

  it('records a consumption from a batch, changes it and cancels it', async () => {
    const consumption = { id: 40, batchId: 7, substanceId: 2, quantity: '2.000' } as ConsumptionRecord;
    const input = { quantity: '2', occurredAt: '2026-09-30T20:00:00Z', note: 'after dinner' };
    expect(
      await send(api.createConsumption(7, input), { method: 'POST', url: '/api/batches/7/consumptions', body: input }, { body: consumption, status: 201 }),
    ).toEqual(consumption);

    const change = { quantity: '3', note: null };
    expect(
      await send(api.updateConsumption(40, change), { method: 'PATCH', url: '/api/consumptions/40', body: change }, { body: consumption }),
    ).toEqual(consumption);

    expect(
      await send(api.deleteConsumption(40), { method: 'DELETE', url: '/api/consumptions/40', body: null }, { body: null, status: 204 }),
    ).toBeNull();
  });

  it('records a one-time consumption of a substance, changes it and deletes it', async () => {
    const oneTime = { id: 5, substanceId: 2, name: 'Pub', quantity: '1.000', totalPrice: '5.00' } as OneTimeRecord;
    const input = { quantity: '1', totalPrice: '5.00', name: 'Pub' };
    expect(
      await send(api.createOneTime(2, input), { method: 'POST', url: '/api/substances/2/one-time-consumptions', body: input }, { body: oneTime, status: 201 }),
    ).toEqual(oneTime);

    const change = { unitPrice: '4.50', name: null };
    expect(
      await send(api.updateOneTime(5, change), { method: 'PATCH', url: '/api/one-time-consumptions/5', body: change }, { body: oneTime }),
    ).toEqual(oneTime);

    expect(
      await send(api.deleteOneTime(5), { method: 'DELETE', url: '/api/one-time-consumptions/5', body: null }, { body: null, status: 204 }),
    ).toBeNull();
  });
});
