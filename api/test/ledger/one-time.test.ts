import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectProblem, makeApi, type Api } from '../support/api.js';
import { rawRows } from '../support/db.js';

let api: Api;
beforeAll(async () => {
  api = await makeApi();
});
afterAll(async () => {
  await api.app.close();
});

describe('one-time consumptions', () => {
  it('records quantity and price: totalPrice, else unitPrice × quantity, else 400', async () => {
    const s = await api.substance();
    const res = await api.post(`/api/substances/${s.id}/one-time-consumptions`, {
      quantity: 1,
      totalPrice: '5',
      name: 'bar X',
      occurredAt: '2026-09-28T22:15:00+02:00',
      note: 'after work',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      substanceId: s.id,
      name: 'bar X',
      quantity: '1.000',
      totalPrice: '5.00',
      occurredAt: '2026-09-28T20:15:00Z',
      note: 'after work',
    });
    expect((await api.oneTime(s.id, { quantity: 3, unitPrice: '1.335' })).totalPrice).toBe('4.01');

    // even with batches of the substance to price it from: a one-time price is always entered
    await api.batch(s.id, { quantity: 6, totalPrice: 6 });
    expectProblem(await api.post(`/api/substances/${s.id}/one-time-consumptions`, { quantity: 1 }), 400, 'validation');
    expectProblem(await api.post('/api/substances/123456/one-time-consumptions', { quantity: 1, totalPrice: 1 }), 404);
  });

  it('never touches stock or batches', async () => {
    const s = await api.substance();
    await api.batch(s.id, { quantity: 6, totalPrice: 6 });
    await api.oneTime(s.id, { quantity: 50, totalPrice: 100 });
    const bar = await api.get(`/api/substances/${s.id}/batches`);
    expect(bar.body.stock).toBe('6.000');
    expect(bar.body.stockBarMax).toBe('6.000');
    expect(bar.body.batches).toHaveLength(1);
    const summary = (await api.get(`/api/substances/${s.id}`)).body.summary;
    expect(summary.peakStock).toBe('6.000');
  });

  it('PATCH corrects fields freely; unitPrice uses the new quantity', async () => {
    const s = await api.substance();
    const o = await api.oneTime(s.id, { quantity: 2, totalPrice: 6 });
    const q = await api.patch(`/api/one-time-consumptions/${o.id}`, { quantity: 3 });
    expect(q.body).toMatchObject({ quantity: '3.000', totalPrice: '6.00' });
    const p = await api.patch(`/api/one-time-consumptions/${o.id}`, { unitPrice: '2.5' });
    expect(p.body.totalPrice).toBe('7.50');
    const t = await api.patch(`/api/one-time-consumptions/${o.id}`, { totalPrice: 8, name: 'pub', note: null });
    expect(t.body).toMatchObject({ totalPrice: '8.00', name: 'pub', note: null });
    expectProblem(await api.patch(`/api/one-time-consumptions/${o.id}`, { quantity: 0 }), 400);
    expectProblem(await api.patch('/api/one-time-consumptions/99999', { quantity: 1 }), 404);
  });

  it('DELETE is a soft delete, excluded from statistics', async () => {
    const s = await api.substance();
    const keep = await api.oneTime(s.id, { quantity: 1, totalPrice: 4, occurredAt: '2026-09-20T12:00:00Z' });
    const gone = await api.oneTime(s.id, { quantity: 2, totalPrice: 10, occurredAt: '2026-09-21T12:00:00Z' });
    expect((await api.del(`/api/one-time-consumptions/${gone.id}`)).status).toBe(204);
    expect(await rawRows('SELECT id FROM one_time_consumptions WHERE id = ? AND deleted_at IS NOT NULL', [gone.id])).toHaveLength(1);

    const stats = await api.get(`/api/substances/${s.id}/one-time`);
    expect(stats.body).toMatchObject({ count: 1, totalQuantity: '1.000', totalSpent: '4.00' });
    const list = await api.get(`/api/substances/${s.id}/one-time/consumptions`);
    expect(list.body.map((o: any) => o.id)).toEqual([keep.id]);
    const series = await api.get('/api/stats?from=2026-09-20&to=2026-09-21');
    expect(series.body).toEqual([
      { period: '2026-09-20', consumed: '1.000', cost: '4.00', spend: '4.00' },
      { period: '2026-09-21', consumed: '0.000', cost: '0.00', spend: '0.00' },
    ]);
    expectProblem(await api.del(`/api/one-time-consumptions/${gone.id}`), 404);
  });
});
