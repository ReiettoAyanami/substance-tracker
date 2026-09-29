import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectProblem, makeApi, type Api } from '../support/api.js';

let api: Api;
beforeAll(async () => {
  api = await makeApi();
});
afterAll(async () => {
  await api.app.close();
});

describe('per-consumption statistics', () => {
  it('batch page: count, avg / min / max quantity, average cost, first consumption', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, {
      name: 'Corona',
      quantity: 10,
      totalPrice: 15,
      occurredAt: '2026-09-01T10:00:00Z',
      note: 'n',
    });
    await api.consume(b.id, { quantity: '0.5', occurredAt: '2026-09-03T10:00:00Z' }); // 0.75
    await api.consume(b.id, { quantity: 2, occurredAt: '2026-09-02T10:00:00Z' }); // 3.00
    await api.consume(b.id, { quantity: 1, occurredAt: '2026-09-04T10:00:00Z' }); // 1.50
    const cancelled = await api.consume(b.id, { quantity: 5, occurredAt: '2026-09-01T11:00:00Z' });
    await api.del(`/api/consumptions/${cancelled.id}`);

    const page = await api.get(`/api/batches/${b.id}`);
    expect(page.body).toEqual({
      id: b.id,
      substanceId: s.id,
      name: 'Corona',
      quantity: '10.000',
      totalPrice: '15.00',
      occurredAt: '2026-09-01T10:00:00Z',
      note: 'n',
      clientRef: null,
      createdAt: expect.any(String),
      remaining: '6.500',
      unitPrice: '1.500000',
      deactivatedAt: null,
      deactivatedByConsumptionId: null,
      deactivatedByAdjustmentId: null,
      consumptionCount: 3,
      avgQuantityPerConsumption: '1.167',
      minConsumption: '0.500',
      maxConsumption: '2.000',
      avgPricePerConsumption: '1.75',
      firstConsumedAt: '2026-09-02T10:00:00Z',
    });
  });

  it('batch page with no consumptions has null statistics', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 1, totalPrice: 1 });
    const page = await api.get(`/api/batches/${b.id}`);
    expect(page.body).toMatchObject({
      consumptionCount: 0,
      avgQuantityPerConsumption: null,
      minConsumption: null,
      maxConsumption: null,
      avgPricePerConsumption: null,
      firstConsumedAt: null,
    });
    expectProblem(await api.get('/api/batches/31337'), 404);
  });

  it('the one-time batch: totals, average unit price and per-consumption statistics', async () => {
    const s = await api.substance();
    const empty = await api.get(`/api/substances/${s.id}/one-time`);
    expect(empty.body).toEqual({
      substanceId: s.id,
      count: 0,
      totalQuantity: '0.000',
      totalSpent: '0.00',
      avgUnitPrice: null,
      avgQuantityPerConsumption: null,
      minConsumption: null,
      maxConsumption: null,
      avgPricePerConsumption: null,
      firstAt: null,
      lastAt: null,
    });

    await api.oneTime(s.id, { quantity: 1, totalPrice: 5, occurredAt: '2026-09-02T20:00:00Z' });
    await api.oneTime(s.id, { quantity: 2, totalPrice: '6.50', occurredAt: '2026-09-01T20:00:00Z' });
    await api.oneTime(s.id, { quantity: '0.5', totalPrice: 3, occurredAt: '2026-09-05T20:00:00Z' });
    const stats = await api.get(`/api/substances/${s.id}/one-time`);
    expect(stats.body).toEqual({
      substanceId: s.id,
      count: 3,
      totalQuantity: '3.500',
      totalSpent: '14.50',
      avgUnitPrice: '4.142857',
      avgQuantityPerConsumption: '1.167',
      minConsumption: '0.500',
      maxConsumption: '2.000',
      avgPricePerConsumption: '4.83',
      firstAt: '2026-09-01T20:00:00Z',
      lastAt: '2026-09-05T20:00:00Z',
    });
  });

  it('substance overall = batch consumptions + one-time consumptions', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 4, totalPrice: 4 });
    await api.consume(b.id, { quantity: 1, occurredAt: '2026-09-01T10:00:00Z' }); // cost 1.00
    await api.consume(b.id, { quantity: 3, occurredAt: '2026-09-02T10:00:00Z' }); // cost 3.00 (closing)
    await api.oneTime(s.id, { quantity: 2, totalPrice: 8, occurredAt: '2026-09-03T10:00:00Z' });
    const summary = (await api.get(`/api/substances/${s.id}`)).body.summary;
    expect(summary.avgQuantityPerConsumption).toBe('2.000');
    expect(summary.avgPricePerConsumption).toBe('4.00');
    expect(summary.lastConsumption).toEqual({ occurredAt: '2026-09-03T10:00:00Z', quantity: '2.000', cost: '8.00' });
  });
});
