import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectProblem, makeApi, type Api } from '../support/api.js';

let api: Api;
beforeAll(async () => {
  api = await makeApi();
});
afterAll(async () => {
  await api.app.close();
});

describe('GET /api/substances/:id/batches (stock bar and sub-cards)', () => {
  it('stock, stockBarMax (active batches only) and shares by quantity and by value', async () => {
    const s = await api.substance({ unit: 'g' });
    const a = await api.batch(s.id, { name: 'A', quantity: 10, totalPrice: 5, occurredAt: '2026-09-01T10:00:00Z' });
    const b = await api.batch(s.id, { name: 'B', quantity: 5, totalPrice: 10, occurredAt: '2026-09-02T10:00:00Z' });
    const done = await api.batch(s.id, { name: 'C', quantity: 2, totalPrice: 2, occurredAt: '2026-08-01T10:00:00Z' });
    const deleted = await api.batch(s.id, { name: 'D', quantity: 100, totalPrice: 1, occurredAt: '2026-08-02T10:00:00Z' });
    await api.consume(done.id, { quantity: 2 });
    await api.del(`/api/batches/${deleted.id}`);
    await api.consume(a.id, { quantity: 5 });

    const bar = await api.get(`/api/substances/${s.id}/batches`);
    expect(bar.status).toBe(200);
    expect(bar.body.stock).toBe('10.000');
    expect(bar.body.stockBarMax).toBe('15.000');
    // A: 5 left at 0.50 = 2.50; B: 5 left at 2.00 = 10.00; total value 12.50
    expect(bar.body.batches).toEqual([
      {
        id: a.id,
        name: 'A',
        occurredAt: '2026-09-01T10:00:00Z',
        quantity: '10.000',
        remaining: '5.000',
        unitPrice: '0.500000',
        totalPrice: '5.00',
        shareByQuantity: '0.5000',
        shareByValue: '0.2000',
        note: null,
        deactivatedAt: null,
      },
      {
        id: b.id,
        name: 'B',
        occurredAt: '2026-09-02T10:00:00Z',
        quantity: '5.000',
        remaining: '5.000',
        unitPrice: '2.000000',
        totalPrice: '10.00',
        shareByQuantity: '0.5000',
        shareByValue: '0.8000',
        note: null,
        deactivatedAt: null,
      },
    ]);

    const all = await api.get(`/api/substances/${s.id}/batches?includeDeactivated=true`);
    expect(all.body.batches.map((x: any) => x.id)).toEqual([done.id, a.id, b.id]);
    expect(all.body.batches[0]).toMatchObject({ remaining: '0.000', shareByQuantity: '0.0000', shareByValue: '0.0000' });
    expect(all.body.batches[0].deactivatedAt).not.toBeNull();
    expect(all.body.stockBarMax).toBe('15.000');
  });

  it('shares are "0.0000" when the denominator is 0 (free batches)', async () => {
    const s = await api.substance();
    await api.batch(s.id, { quantity: 4, totalPrice: 0 });
    await api.batch(s.id, { quantity: 1, totalPrice: 0 });
    const bar = await api.get(`/api/substances/${s.id}/batches`);
    expect(bar.body.batches.map((x: any) => [x.shareByQuantity, x.shareByValue])).toEqual([
      ['0.8000', '0.0000'],
      ['0.2000', '0.0000'],
    ]);
  });

  it('unit price keeps 6 decimals; shares 4', async () => {
    const s = await api.substance();
    await api.batch(s.id, { quantity: 3, totalPrice: 10, occurredAt: '2026-09-01T10:00:00Z' });
    await api.batch(s.id, { quantity: 3, totalPrice: 5, occurredAt: '2026-09-02T10:00:00Z' });
    const bar = await api.get(`/api/substances/${s.id}/batches`);
    expect(bar.body.batches.map((x: any) => [x.unitPrice, x.shareByQuantity, x.shareByValue])).toEqual([
      ['3.333333', '0.5000', '0.6667'],
      ['1.666667', '0.5000', '0.3333'],
    ]);
  });

  it('404 for unknown substances', async () => {
    expectProblem(await api.get('/api/substances/4040/batches'), 404);
  });
});

describe('peak stock', () => {
  it('walks batches, adjustments and consumptions in time order; one-time excluded', async () => {
    const s = await api.substance();
    const a = await api.batch(s.id, { quantity: 10, totalPrice: 10, occurredAt: '2026-09-01T10:00:00Z' });
    await api.consume(a.id, { quantity: 4, occurredAt: '2026-09-02T10:00:00Z' }); // 6
    const b = await api.batch(s.id, { quantity: 5, totalPrice: 5, occurredAt: '2026-09-03T10:00:00Z' }); // 11
    await api.adjust(b.id, { delta: -1, reason: 'lost', occurredAt: '2026-09-04T10:00:00Z' }); // 10
    await api.consume(a.id, { quantity: 6, occurredAt: '2026-09-05T10:00:00Z' }); // 4, A deactivated
    const c = await api.batch(s.id, { quantity: 3, totalPrice: 3, occurredAt: '2026-09-06T10:00:00Z' }); // 7
    // same instant: the batch counts before the consumption
    await api.consume(c.id, { quantity: 3, occurredAt: '2026-09-06T10:00:00Z' }); // 4
    await api.oneTime(s.id, { quantity: 100, totalPrice: 1, occurredAt: '2026-09-07T10:00:00Z' });
    const gone = await api.batch(s.id, { quantity: 50, totalPrice: 1, occurredAt: '2026-09-08T10:00:00Z' });
    await api.del(`/api/batches/${gone.id}`);

    const summary = (await api.get(`/api/substances/${s.id}`)).body.summary;
    expect(summary.peakStock).toBe('11.000');
    expect(summary.stock).toBe('4.000');
    expect(summary.stockBarMax).toBe('5.000');
  });
});

describe('card summary', () => {
  it('has stock, peak, last batch, last consumption, averages and spend this month', async () => {
    const s = await api.substance();
    // Europe/Rome: 2026-08-31T22:30Z is 2026-09-01 00:30 local -> September
    const b1 = await api.batch(s.id, { name: 'Corona', quantity: 6, totalPrice: '7.20', occurredAt: '2026-08-31T22:30:00Z' });
    // 2026-08-31T21:30Z is 23:30 on August 31 -> not this month
    const old = await api.batch(s.id, { name: 'old', quantity: 2, totalPrice: 3, occurredAt: '2026-08-31T21:30:00Z' });
    await api.consume(b1.id, { quantity: 2, occurredAt: '2026-09-10T20:00:00Z' }); // cost 2.40
    await api.oneTime(s.id, { quantity: 1, totalPrice: '5.00', occurredAt: '2026-09-12T21:00:00Z' });
    // a newer batch, bought in October (the future relative to the fixed clock): not this month
    const b3 = await api.batch(s.id, { name: 'Peroni', quantity: 1, totalPrice: 1, occurredAt: '2026-10-02T10:00:00Z' });

    const res = await api.get(`/api/substances/${s.id}`);
    expect(res.body.summary).toEqual({
      stock: '7.000',
      stockBarMax: '9.000',
      stockBarSegments: [
        { batchId: old.id, name: 'old', remaining: '2.000', unitPrice: '1.500000' },
        { batchId: b1.id, name: 'Corona', remaining: '4.000', unitPrice: '1.200000' },
        { batchId: b3.id, name: 'Peroni', remaining: '1.000', unitPrice: '1.000000' },
      ],
      // old (+2) then Corona (+6) = 8, then -2, then +1: the peak is 8
      peakStock: '8.000',
      lastBatch: {
        id: b3.id,
        name: 'Peroni',
        occurredAt: '2026-10-02T10:00:00Z',
        quantity: '1.000',
        remaining: '1.000',
        totalPrice: '1.00',
        unitPrice: '1.000000',
      },
      // Corona 4 left at 1.20 + old 2 at 1.50 + Peroni 1 at 1.00 = 8.80 over a stock of 7
      avgUnitPrice: '1.257143',
      lastConsumption: { occurredAt: '2026-09-12T21:00:00Z', quantity: '1.000', cost: '5.00' },
      avgQuantityPerConsumption: '1.500',
      avgPricePerConsumption: '3.70',
      spendThisMonth: '12.20',
    });

    const list = await api.get('/api/substances');
    expect(list.body[0].summary).toEqual(res.body.summary);
  });

  it('gives the unit price of the last batch, even when it is finished', async () => {
    const s = await api.substance({ unit: 'cigarette' });
    await api.batch(s.id, { quantity: 20, totalPrice: '6.20', occurredAt: '2026-08-01T10:00:00Z' });
    const last = await api.batch(s.id, { quantity: 20, totalPrice: '6.50', occurredAt: '2026-09-20T10:00:00Z' });
    await api.consume(last.id, { quantity: 7, occurredAt: '2026-09-21T20:00:00Z' });
    await api.consume(last.id, { quantity: 13, occurredAt: '2026-09-23T20:00:00Z' });

    const summary = (await api.get(`/api/substances/${s.id}`)).body.summary;
    expect(summary.lastBatch).toMatchObject({ id: last.id, unitPrice: '0.325000' });
  });

  it('gives what was bought of the last batch and what is left of it: 0 once finished', async () => {
    const s = await api.substance({ unit: 'g' });
    await api.batch(s.id, { quantity: 5, totalPrice: '50.00', occurredAt: '2026-08-01T10:00:00Z' });
    const last = await api.batch(s.id, { quantity: 10, totalPrice: '89.30', occurredAt: '2026-09-20T10:00:00Z' });
    await api.consume(last.id, { quantity: '2.5', occurredAt: '2026-09-21T20:00:00Z' });
    await api.adjust(last.id, { delta: '-0.5', reason: 'spilled', occurredAt: '2026-09-22T20:00:00Z' });

    const partly = (await api.get(`/api/substances/${s.id}`)).body.summary;
    expect(partly.lastBatch).toMatchObject({ id: last.id, quantity: '10.000', remaining: '7.000' });

    await api.consume(last.id, { quantity: 7, occurredAt: '2026-09-23T20:00:00Z' }); // finished: deactivated
    const finished = (await api.get(`/api/substances/${s.id}`)).body.summary;
    expect(finished.lastBatch).toMatchObject({ id: last.id, quantity: '10.000', remaining: '0.000' });
  });

  it('gives the average unit price of the stock: Σ(remaining × unit price) ÷ stock, active batches only', async () => {
    const s = await api.substance({ unit: 'g' });
    const a = await api.batch(s.id, { quantity: 10, totalPrice: '10.00', occurredAt: '2026-09-01T10:00:00Z' });
    await api.batch(s.id, { quantity: 10, totalPrice: '20.00', occurredAt: '2026-09-02T10:00:00Z' });
    const finished = await api.batch(s.id, { quantity: 2, totalPrice: '100.00', occurredAt: '2026-09-03T10:00:00Z' });
    await api.consume(finished.id, { quantity: 2, occurredAt: '2026-09-04T10:00:00Z' });
    await api.consume(a.id, { quantity: 5, occurredAt: '2026-09-05T10:00:00Z' });
    await api.oneTime(s.id, { quantity: 1, totalPrice: '99.00', occurredAt: '2026-09-06T10:00:00Z' });

    const summary = (await api.get(`/api/substances/${s.id}`)).body.summary;
    // A: 5 left at 1.00, B: 10 left at 2.00 -> 25.00 / 15; the finished batch and the one-time do not count
    expect(summary.avgUnitPrice).toBe('1.666667');
  });

  it('has no average unit price when the stock is 0', async () => {
    const s = await api.substance({ unit: 'bottle' });
    const b = await api.batch(s.id, { quantity: 6, totalPrice: '7.20', occurredAt: '2026-09-05T17:00:00Z' });
    await api.consume(b.id, { quantity: 6, occurredAt: '2026-09-06T19:00:00Z' });

    const summary = (await api.get(`/api/substances/${s.id}`)).body.summary;
    expect(summary.stock).toBe('0.000');
    expect(summary.avgUnitPrice).toBeNull();
    expect(summary.lastBatch.unitPrice).toBe('1.200000');
  });

  it('has the stock bar segments: active batches, oldest first, with their unit price', async () => {
    const s = await api.substance({ unit: 'capsule' });
    const newer = await api.batch(s.id, { quantity: 200, totalPrice: 64, occurredAt: '2026-09-25T16:00:00Z' });
    const older = await api.batch(s.id, { name: 'Lavazza', quantity: 100, totalPrice: 35, occurredAt: '2026-07-01T16:00:00Z' });
    const finished = await api.batch(s.id, { quantity: 1, totalPrice: 1, occurredAt: '2026-08-01T16:00:00Z' });
    const deleted = await api.batch(s.id, { quantity: 5, totalPrice: 1, occurredAt: '2026-08-02T16:00:00Z' });
    await api.consume(finished.id, { quantity: 1, occurredAt: '2026-08-03T07:00:00Z' });
    await api.del(`/api/batches/${deleted.id}`);
    await api.consume(older.id, { quantity: 99, occurredAt: '2026-08-20T07:00:00Z' });

    const summary = (await api.get(`/api/substances/${s.id}`)).body.summary;
    expect(summary.stockBarMax).toBe('300.000');
    expect(summary.stockBarSegments).toEqual([
      { batchId: older.id, name: 'Lavazza', remaining: '1.000', unitPrice: '0.350000' },
      { batchId: newer.id, name: null, remaining: '200.000', unitPrice: '0.320000' },
    ]);
  });
});
