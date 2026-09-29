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

async function batchOf(quantity: number, totalPrice = 10) {
  const s = await api.substance();
  const b = await api.batch(s.id, { quantity, totalPrice });
  return { s, b };
}

describe('POST /api/batches/:id/consumptions', () => {
  it('records a consumption from the chosen batch', async () => {
    const { s, b } = await batchOf(10);
    const res = await api.post(`/api/batches/${b.id}/consumptions`, {
      quantity: '2.5',
      occurredAt: '2026-09-29T20:00:00Z',
      note: 'evening',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      batchId: b.id,
      substanceId: s.id,
      quantity: '2.500',
      occurredAt: '2026-09-29T20:00:00Z',
      note: 'evening',
      deletedAt: null,
    });
    const page = await api.get(`/api/batches/${b.id}`);
    expect(page.body.remaining).toBe('7.500');
  });

  it('409 when the quantity is above the remaining; nothing is written', async () => {
    const { b } = await batchOf(5);
    await api.consume(b.id, { quantity: 3 });
    const res = await api.post(`/api/batches/${b.id}/consumptions`, { quantity: '2.001' });
    expectProblem(res, 409, 'quantity-exceeds-remaining');
    expect(await rawRows('SELECT id FROM consumptions WHERE batch_id = ?', [b.id])).toHaveLength(1);
  });

  it('400 for a zero, negative or malformed quantity; 404 for an unknown batch', async () => {
    const { b } = await batchOf(5);
    expectProblem(await api.post(`/api/batches/${b.id}/consumptions`, { quantity: 0 }), 400);
    expectProblem(await api.post(`/api/batches/${b.id}/consumptions`, { quantity: -1 }), 400);
    expectProblem(await api.post(`/api/batches/${b.id}/consumptions`, { quantity: '1,5' }), 400);
    expectProblem(await api.post(`/api/batches/${b.id}/consumptions`, {}), 400);
    expectProblem(await api.post('/api/batches/555555/consumptions', { quantity: 1 }), 404);
  });

  it('the consumption that empties the batch deactivates it', async () => {
    const { s, b } = await batchOf(5);
    await api.consume(b.id, { quantity: 3 });
    const last = await api.consume(b.id, { quantity: 2 });

    const page = await api.get(`/api/batches/${b.id}`);
    expect(page.body).toMatchObject({
      remaining: '0.000',
      deactivatedAt: '2026-09-29T10:00:00Z',
      deactivatedByConsumptionId: last.id,
      deactivatedByAdjustmentId: null,
    });
    const bar = await api.get(`/api/substances/${s.id}/batches`);
    expect(bar.body.batches).toHaveLength(0);
    expect(bar.body.stockBarMax).toBe('0.000');

    expectProblem(await api.post(`/api/batches/${b.id}/consumptions`, { quantity: 1 }), 409, 'batch-deactivated');
  });

  it('cancelling the consumption that emptied the batch reopens it', async () => {
    const { s, b } = await batchOf(5);
    await api.consume(b.id, { quantity: 3 });
    const last = await api.consume(b.id, { quantity: 2 });

    expect((await api.del(`/api/consumptions/${last.id}`)).status).toBe(204);
    const [row] = await rawRows(
      'SELECT deactivated_at, deactivated_by_consumption_id, deactivated_by_adjustment_id FROM batches WHERE id = ?',
      [b.id],
    );
    expect(row).toMatchObject({
      deactivated_at: null,
      deactivated_by_consumption_id: null,
      deactivated_by_adjustment_id: null,
    });
    const [cancelled] = await rawRows('SELECT deleted_at FROM consumptions WHERE id = ?', [last.id]);
    expect(cancelled?.deleted_at).toBeInstanceOf(Date);

    const bar = await api.get(`/api/substances/${s.id}/batches`);
    expect(bar.body.batches[0]).toMatchObject({ id: b.id, remaining: '2.000' });
    // and it can be consumed again
    await api.consume(b.id, { quantity: 1 });
  });

  it('other movements of a deactivated batch cannot be edited or cancelled', async () => {
    const { b } = await batchOf(5);
    const first = await api.consume(b.id, { quantity: 3 });
    const last = await api.consume(b.id, { quantity: 2 });

    expectProblem(await api.patch(`/api/consumptions/${first.id}`, { quantity: 1 }), 409, 'batch-deactivated');
    expectProblem(await api.patch(`/api/consumptions/${first.id}`, { note: 'x' }), 409, 'batch-deactivated');
    expectProblem(await api.del(`/api/consumptions/${first.id}`), 409, 'batch-deactivated');
    // even the emptying one can only be cancelled, not edited
    expectProblem(await api.patch(`/api/consumptions/${last.id}`, { quantity: 1 }), 409, 'batch-deactivated');
    expect(await rawRows('SELECT id FROM consumptions WHERE deleted_at IS NULL')).toHaveLength(2);
  });
});

describe('PATCH /api/consumptions/:id', () => {
  it('re-checks remaining without the row itself', async () => {
    const { b } = await batchOf(10);
    const c1 = await api.consume(b.id, { quantity: 4 });
    const c2 = await api.consume(b.id, { quantity: 3 });
    // remaining without c1 = 7 -> 7.001 is too much
    expectProblem(await api.patch(`/api/consumptions/${c1.id}`, { quantity: '7.001' }), 409, 'quantity-exceeds-remaining');
    const res = await api.patch(`/api/consumptions/${c1.id}`, {
      quantity: 5,
      occurredAt: '2026-09-28T21:00:00+02:00',
      note: 'fixed',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ quantity: '5.000', occurredAt: '2026-09-28T19:00:00Z', note: 'fixed' });
    expect((await api.get(`/api/batches/${b.id}`)).body.remaining).toBe('2.000');

    // an edit that brings remaining to exactly 0 deactivates the batch with this row
    await api.patch(`/api/consumptions/${c2.id}`, { quantity: 5 });
    const page = await api.get(`/api/batches/${b.id}`);
    expect(page.body.deactivatedByConsumptionId).toBe(c2.id);
    expect(page.body.remaining).toBe('0.000');
  });

  it('404 for unknown or cancelled consumptions', async () => {
    const { b } = await batchOf(10);
    const c = await api.consume(b.id, { quantity: 1 });
    await api.del(`/api/consumptions/${c.id}`);
    expectProblem(await api.patch(`/api/consumptions/${c.id}`, { quantity: 2 }), 404);
    expectProblem(await api.del(`/api/consumptions/${c.id}`), 404);
    expectProblem(await api.patch('/api/consumptions/999999', { quantity: 2 }), 404);
  });

  it('refuses edits and cancels while the substance is archived', async () => {
    const { s, b } = await batchOf(10);
    const c = await api.consume(b.id, { quantity: 1 });
    await api.patch(`/api/substances/${s.id}`, { archived: true });
    expectProblem(await api.patch(`/api/consumptions/${c.id}`, { quantity: 2 }), 409, 'substance-archived');
    expectProblem(await api.del(`/api/consumptions/${c.id}`), 409, 'substance-archived');
  });
});

describe('DELETE /api/consumptions/:id', () => {
  it('cancelling on an active batch is a soft delete', async () => {
    const { b } = await batchOf(10);
    const c = await api.consume(b.id, { quantity: 4 });
    expect((await api.del(`/api/consumptions/${c.id}`)).status).toBe(204);
    expect((await api.get(`/api/batches/${b.id}`)).body.remaining).toBe('10.000');
    expect(await rawRows('SELECT id FROM consumptions WHERE id = ?', [c.id])).toHaveLength(1);
  });

  it('409 when cancelling would lift remaining above the bought quantity', async () => {
    const { b } = await batchOf(10);
    const c = await api.consume(b.id, { quantity: 3 });
    await api.adjust(b.id, { delta: 3, reason: 'weighed: there is more' });
    expectProblem(await api.del(`/api/consumptions/${c.id}`), 409, 'remaining-above-quantity');
  });
});
