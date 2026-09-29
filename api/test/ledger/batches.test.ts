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

describe('POST /api/substances/:id/batches', () => {
  it('records a batch with quantity and totalPrice', async () => {
    const s = await api.substance();
    const res = await api.post(`/api/substances/${s.id}/batches`, {
      name: 'Corona',
      quantity: '6',
      totalPrice: 7.5,
      occurredAt: '2026-09-29T23:40:00+02:00',
      note: 'six-pack',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      substanceId: s.id,
      name: 'Corona',
      quantity: '6.000',
      totalPrice: '7.50',
      occurredAt: '2026-09-29T21:40:00Z',
      note: 'six-pack',
      clientRef: null,
      deactivatedAt: null,
      deactivatedByConsumptionId: null,
      deactivatedByAdjustmentId: null,
      deletedAt: null,
    });
    const [row] = await rawRows('SELECT occurred_at, quantity, total_price FROM batches WHERE id = ?', [res.body.id]);
    expect((row?.occurred_at as Date).toISOString()).toBe('2026-09-29T21:40:00.000Z');
    expect(row?.quantity).toBe('6.000');
    expect(row?.total_price).toBe('7.50');
  });

  it('defaults occurredAt to now', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 1, totalPrice: 1 });
    expect(b.occurredAt).toBe('2026-09-29T10:00:00Z');
  });

  it('expands refills × refillQuantity and stores only the quantity', async () => {
    const s = await api.substance({ refillQuantity: 6 });
    const b = await api.batch(s.id, { refills: 3, totalPrice: 18 });
    expect(b.quantity).toBe('18.000');
    const cols = await rawRows(
      `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'batches' AND COLUMN_NAME LIKE '%refill%'`,
    );
    expect(cols).toHaveLength(0);
  });

  it('400 when refills is used without a refillQuantity, or when quantity/refills are not exactly one', async () => {
    const s = await api.substance();
    expectProblem(await api.post(`/api/substances/${s.id}/batches`, { refills: 2, totalPrice: 1 }), 400, 'validation');
    const r = await api.substance({ refillQuantity: 6 });
    expectProblem(await api.post(`/api/substances/${r.id}/batches`, { quantity: 6, refills: 1, totalPrice: 1 }), 400);
    expectProblem(await api.post(`/api/substances/${r.id}/batches`, { totalPrice: 1 }), 400);
    expectProblem(await api.post(`/api/substances/${r.id}/batches`, { quantity: 0, totalPrice: 1 }), 400);
    expectProblem(await api.post(`/api/substances/${r.id}/batches`, { quantity: -1, totalPrice: 1 }), 400);
    expectProblem(await api.post(`/api/substances/${r.id}/batches`, { quantity: '1.0001', totalPrice: 1 }), 400);
    expectProblem(await api.post(`/api/substances/${r.id}/batches`, { quantity: '1e3', totalPrice: 1 }), 400);
    expectProblem(await api.post(`/api/substances/${r.id}/batches`, { quantity: 1, totalPrice: -1 }), 400);
    expect(await rawRows('SELECT id FROM batches')).toHaveLength(0);
  });

  it('price: totalPrice, else unitPrice × quantity; without either, 400 (the API never guesses a price)', async () => {
    const s = await api.substance();
    expect((await api.batch(s.id, { quantity: 3, totalPrice: '6.505', unitPrice: 100 })).totalPrice).toBe('6.51');
    expect((await api.batch(s.id, { quantity: 3, unitPrice: '0.125' })).totalPrice).toBe('0.38');

    const res = await api.post(`/api/substances/${s.id}/batches`, { quantity: 3 });
    expectProblem(res, 400, 'validation');
    expect(res.body.errors[0].field).toBe('totalPrice');
  });

  it('a total price of 0 is allowed (a gift)', async () => {
    const s = await api.substance();
    expect((await api.batch(s.id, { quantity: 2, totalPrice: 0 })).totalPrice).toBe('0.00');
  });

  it('occurredAt needs an offset', async () => {
    const s = await api.substance();
    expectProblem(await api.post(`/api/substances/${s.id}/batches`, { quantity: 1, totalPrice: 1, occurredAt: '2026-09-29T10:00:00' }), 400);
    expectProblem(await api.post(`/api/substances/${s.id}/batches`, { quantity: 1, totalPrice: 1, occurredAt: 'yesterday' }), 400);
  });

  it('404 for an unknown substance', async () => {
    expectProblem(await api.post('/api/substances/987654/batches', { quantity: 1, totalPrice: 1 }), 404);
  });
});

describe('PATCH /api/batches/:id', () => {
  it('corrects name, note, occurredAt, quantity and totalPrice of an active batch', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 10, totalPrice: 10 });
    const res = await api.patch(`/api/batches/${b.id}`, {
      name: 'Peroni',
      note: null,
      occurredAt: '2026-09-28T08:00:00Z',
      quantity: '12.5',
      totalPrice: '11.999',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Peroni',
      note: null,
      occurredAt: '2026-09-28T08:00:00Z',
      quantity: '12.500',
      totalPrice: '12.00',
    });
  });

  it('the new quantity must leave remaining above 0', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 10, totalPrice: 10 });
    await api.consume(b.id, { quantity: 4 });
    await api.adjust(b.id, { delta: -1, reason: 'spilled' });
    // used = 4 consumed + 1 lost = 5
    expectProblem(await api.patch(`/api/batches/${b.id}`, { quantity: 5 }), 409, 'quantity-below-used');
    expectProblem(await api.patch(`/api/batches/${b.id}`, { quantity: 3 }), 409, 'quantity-below-used');
    const ok = await api.patch(`/api/batches/${b.id}`, { quantity: '5.001' });
    expect(ok.status).toBe(200);
    const bar = await api.get(`/api/substances/${s.id}/batches`);
    expect(bar.body.batches[0].remaining).toBe('0.001');
  });

  it('a deactivated batch cannot be edited or deleted', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 2, totalPrice: 2 });
    await api.consume(b.id, { quantity: 2 });
    expectProblem(await api.patch(`/api/batches/${b.id}`, { name: 'x' }), 409, 'batch-deactivated');
    expectProblem(await api.del(`/api/batches/${b.id}`), 409, 'batch-deactivated');
  });

  it('400 on an empty patch or unknown fields, 404 on unknown batch', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 2, totalPrice: 2 });
    expectProblem(await api.patch(`/api/batches/${b.id}`, {}), 400);
    expectProblem(await api.patch(`/api/batches/${b.id}`, { refills: 2 }), 400);
    expectProblem(await api.patch('/api/batches/777777', { name: 'x' }), 404);
  });
});

describe('DELETE /api/batches/:id', () => {
  it('409 while the batch has non-deleted consumptions or adjustments', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 10, totalPrice: 10 });
    const c = await api.consume(b.id, { quantity: 1 });
    expectProblem(await api.del(`/api/batches/${b.id}`), 409, 'batch-has-movements');
    expect((await api.del(`/api/consumptions/${c.id}`)).status).toBe(204);

    const a = await api.adjust(b.id, { delta: -1, reason: 'lost' });
    expectProblem(await api.del(`/api/batches/${b.id}`), 409, 'batch-has-movements');
    expect((await api.del(`/api/adjustments/${a.id}`)).status).toBe(204);

    expect((await api.del(`/api/batches/${b.id}`)).status).toBe(204);
  });

  it('soft delete: the row stays, the batch disappears from stock and statistics', async () => {
    const s = await api.substance();
    const keep = await api.batch(s.id, { quantity: 5, totalPrice: 5, occurredAt: '2026-09-10T10:00:00Z' });
    const gone = await api.batch(s.id, { quantity: 7, totalPrice: 14, occurredAt: '2026-09-11T10:00:00Z' });
    expect((await api.del(`/api/batches/${gone.id}`)).status).toBe(204);

    const rows = await rawRows('SELECT deleted_at FROM batches WHERE id = ?', [gone.id]);
    expect(rows[0]?.deleted_at).toBeInstanceOf(Date);

    const bar = await api.get(`/api/substances/${s.id}/batches?includeDeactivated=true`);
    expect(bar.body.batches.map((b: any) => b.id)).toEqual([keep.id]);
    expect(bar.body.stock).toBe('5.000');

    const summary = (await api.get(`/api/substances/${s.id}`)).body.summary;
    expect(summary.stockBarMax).toBe('5.000');
    expect(summary.peakStock).toBe('5.000');
    expect(summary.spendThisMonth).toBe('5.00');
    expect(summary.lastBatch.id).toBe(keep.id);

    const stats = await api.get('/api/stats?from=2026-09-01&to=2026-09-30&groupBy=month');
    expect(stats.body).toEqual([{ period: '2026-09', consumed: '0.000', cost: '0.00', spend: '5.00' }]);

    expectProblem(await api.get(`/api/batches/${gone.id}`), 404);
    expectProblem(await api.del(`/api/batches/${gone.id}`), 404);
    expectProblem(await api.post(`/api/batches/${gone.id}/consumptions`, { quantity: 1 }), 404);
  });
});
