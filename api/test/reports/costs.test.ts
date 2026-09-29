import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { consumptionCosts } from '../../src/modules/reports/service.js';
import { makeApi, type Api } from '../support/api.js';

let api: Api;
beforeAll(async () => {
  api = await makeApi();
});
afterAll(async () => {
  await api.app.close();
});

function sumMoney(values: string[]): string {
  const cents = values.reduce((acc, v) => acc + Math.round(Number(v) * 100), 0);
  return (cents / 100).toFixed(2);
}

async function costsOldestFirst(batchId: number): Promise<string[]> {
  const res = await api.get(`/api/batches/${batchId}/movements?limit=200`);
  return res.body
    .filter((m: any) => m.type === 'consumption')
    .reverse()
    .map((m: any) => m.cost);
}

describe('cost of a consumption', () => {
  it('20 units for 6.50, consumed 19 × 1 + 1: the last one takes the remainder, total exactly 6.50', async () => {
    const s = await api.substance({ unit: 'cigarette' });
    const b = await api.batch(s.id, { quantity: 20, totalPrice: '6.50', occurredAt: '2026-09-01T08:00:00Z' });
    for (let i = 0; i < 20; i++) {
      await api.consume(b.id, { quantity: 1, occurredAt: `2026-09-${String(2 + i).padStart(2, '0')}T08:00:00Z` });
    }
    const costs = await costsOldestFirst(b.id);
    expect(costs).toHaveLength(20);
    expect(costs.slice(0, 19)).toEqual(Array(19).fill('0.33'));
    expect(costs[19]).toBe('0.23');
    expect(sumMoney(costs)).toBe('6.50');

    const page = await api.get(`/api/batches/${b.id}`);
    expect(page.body).toMatchObject({
      unitPrice: '0.325000',
      consumptionCount: 20,
      avgPricePerConsumption: '0.33', // 6.50 / 20 = 0.325 -> half-up
      remaining: '0.000',
    });

    const stats = await api.get(`/api/stats?from=2026-09-01&to=2026-09-30&groupBy=month&substanceId=${s.id}`);
    expect(stats.body).toEqual([{ period: '2026-09', consumed: '20.000', cost: '6.50', spend: '6.50' }]);
  });

  it('3 units for 10.00 consumed 1 + 1 + 1 cost 3.33, 3.33, 3.34', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 3, totalPrice: 10 });
    const c1 = await api.consume(b.id, { quantity: 1, occurredAt: '2026-09-10T10:00:00Z' });
    await api.consume(b.id, { quantity: 1, occurredAt: '2026-09-11T10:00:00Z' });
    const c3 = await api.consume(b.id, { quantity: 1, occurredAt: '2026-09-12T10:00:00Z' });
    expect(await costsOldestFirst(b.id)).toEqual(['3.33', '3.33', '3.34']);

    // the substance history shows the same costs
    const moves = await api.get(`/api/substances/${s.id}/movements?type=consumption`);
    expect(moves.body.map((m: any) => m.cost)).toEqual(['3.34', '3.33', '3.33']);
    expect(moves.body[0].id).toBe(c3.id);

    // reopening the batch: every remaining consumption costs quantity × unit price
    await api.del(`/api/consumptions/${c3.id}`);
    expect(await costsOldestFirst(b.id)).toEqual(['3.33', '3.33']);

    // the deactivating consumption may be any of them, not the latest in time
    await api.patch(`/api/consumptions/${c1.id}`, { quantity: 2 });
    expect(await costsOldestFirst(b.id)).toEqual(['6.67', '3.33']);
  });

  it('a batch emptied by an adjustment gets no remainder: costs are quantity × unit price', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 3, totalPrice: 10 });
    await api.consume(b.id, { quantity: 1, occurredAt: '2026-09-10T10:00:00Z' });
    await api.consume(b.id, { quantity: 1, occurredAt: '2026-09-11T10:00:00Z' });
    await api.adjust(b.id, { delta: -1, reason: 'lost', occurredAt: '2026-09-12T10:00:00Z' });
    expect(await costsOldestFirst(b.id)).toEqual(['3.33', '3.33']);
  });

  it('pure function: remainder uses unitPrice × total consumed', () => {
    const batch = {
      id: 1,
      quantity: '4.000',
      total_price: '1.00',
      deactivated_at: new Date(),
      deactivated_by_consumption_id: 12,
    };
    const costs = consumptionCosts(
      [batch],
      [
        { id: 10, batch_id: 1, quantity: '1.500' },
        { id: 11, batch_id: 1, quantity: '1.500' },
        { id: 12, batch_id: 1, quantity: '1.000' },
      ],
    );
    // 1.5 × 0.25 = 0.375 -> 0.38 twice; last = 1.00 - 0.76 = 0.24
    expect([...costs.entries()].map(([id, c]) => [id, c.toFixed(2)])).toEqual([
      [10, '0.38'],
      [11, '0.38'],
      [12, '0.24'],
    ]);
  });
});
