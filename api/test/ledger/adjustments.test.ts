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

describe('POST /api/batches/:id/adjustments', () => {
  it('records a signed correction with a reason', async () => {
    const { s, b } = await batchOf(10);
    const res = await api.post(`/api/batches/${b.id}/adjustments`, {
      delta: '-1.5',
      reason: '  spilled ',
      occurredAt: '2026-09-29T08:00:00Z',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ batchId: b.id, substanceId: s.id, delta: '-1.500', reason: 'spilled' });
    expect((await api.get(`/api/batches/${b.id}`)).body.remaining).toBe('8.500');
  });

  it('400 for delta 0 or a missing / empty reason', async () => {
    const { b } = await batchOf(10);
    expectProblem(await api.post(`/api/batches/${b.id}/adjustments`, { delta: 0, reason: 'x' }), 400);
    expectProblem(await api.post(`/api/batches/${b.id}/adjustments`, { delta: '-0.000', reason: 'x' }), 400);
    expectProblem(await api.post(`/api/batches/${b.id}/adjustments`, { delta: -1 }), 400);
    expectProblem(await api.post(`/api/batches/${b.id}/adjustments`, { delta: -1, reason: '   ' }), 400);
    expectProblem(await api.post(`/api/batches/${b.id}/adjustments`, { delta: -1, reason: '' }), 400);
  });

  it('409 below 0 or above the bought quantity', async () => {
    const { b } = await batchOf(10);
    await api.consume(b.id, { quantity: 4 });
    expectProblem(await api.post(`/api/batches/${b.id}/adjustments`, { delta: '-6.001', reason: 'lost' }), 409, 'remaining-below-zero');
    expectProblem(await api.post(`/api/batches/${b.id}/adjustments`, { delta: '4.001', reason: 'found' }), 409, 'remaining-above-quantity');
    const ok = await api.adjust(b.id, { delta: 4, reason: 'found: back to full' });
    expect(ok.delta).toBe('4.000');
    expect((await api.get(`/api/batches/${b.id}`)).body.remaining).toBe('10.000');
  });

  it('a negative adjustment that empties the batch deactivates it; cancelling it reopens the batch', async () => {
    const { s, b } = await batchOf(10);
    const c = await api.consume(b.id, { quantity: 4 });
    const a = await api.adjust(b.id, { delta: -6, reason: 'gifted the rest' });

    const page = await api.get(`/api/batches/${b.id}`);
    expect(page.body).toMatchObject({
      remaining: '0.000',
      deactivatedByAdjustmentId: a.id,
      deactivatedByConsumptionId: null,
    });
    expect(page.body.deactivatedAt).not.toBeNull();

    // other movements of the deactivated batch are frozen
    expectProblem(await api.patch(`/api/consumptions/${c.id}`, { quantity: 3 }), 409, 'batch-deactivated');
    expectProblem(await api.del(`/api/consumptions/${c.id}`), 409, 'batch-deactivated');
    expectProblem(await api.patch(`/api/adjustments/${a.id}`, { reason: 'typo' }), 409, 'batch-deactivated');
    expectProblem(await api.post(`/api/batches/${b.id}/adjustments`, { delta: 1, reason: 'x' }), 409, 'batch-deactivated');

    expect((await api.del(`/api/adjustments/${a.id}`)).status).toBe(204);
    const reopened = await api.get(`/api/batches/${b.id}`);
    expect(reopened.body).toMatchObject({
      remaining: '6.000',
      deactivatedAt: null,
      deactivatedByAdjustmentId: null,
      deactivatedByConsumptionId: null,
    });
    const [row] = await rawRows('SELECT deleted_at FROM adjustments WHERE id = ?', [a.id]);
    expect(row?.deleted_at).toBeInstanceOf(Date);
    const bar = await api.get(`/api/substances/${s.id}/batches`);
    expect(bar.body.stock).toBe('6.000');
  });

  it('a consumption cannot cancel the deactivation made by an adjustment', async () => {
    const { b } = await batchOf(10);
    const c = await api.consume(b.id, { quantity: 4 });
    await api.adjust(b.id, { delta: -6, reason: 'lost' });
    expectProblem(await api.del(`/api/consumptions/${c.id}`), 409, 'batch-deactivated');
  });
});

describe('PATCH / DELETE /api/adjustments/:id', () => {
  it('PATCH re-checks remaining without the row, and an edit to exactly 0 deactivates', async () => {
    const { b } = await batchOf(10);
    await api.consume(b.id, { quantity: 4 });
    const a = await api.adjust(b.id, { delta: -1, reason: 'lost' });
    expectProblem(await api.patch(`/api/adjustments/${a.id}`, { delta: '-6.5' }), 409, 'remaining-below-zero');
    expectProblem(await api.patch(`/api/adjustments/${a.id}`, { delta: '4.5' }), 409, 'remaining-above-quantity');
    expectProblem(await api.patch(`/api/adjustments/${a.id}`, { reason: ' ' }), 400);
    const ok = await api.patch(`/api/adjustments/${a.id}`, { delta: 2, reason: 'weighed', occurredAt: '2026-09-20T10:00:00Z' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ delta: '2.000', reason: 'weighed', occurredAt: '2026-09-20T10:00:00Z' });

    await api.patch(`/api/adjustments/${a.id}`, { delta: -6 });
    const page = await api.get(`/api/batches/${b.id}`);
    expect(page.body.deactivatedByAdjustmentId).toBe(a.id);
  });

  it('DELETE refuses to take remaining below or to 0', async () => {
    const { b } = await batchOf(10);
    await api.consume(b.id, { quantity: 8 });
    const plus = await api.adjust(b.id, { delta: 3, reason: 'found' });
    await api.consume(b.id, { quantity: 3 }); // remaining 2
    expectProblem(await api.del(`/api/adjustments/${plus.id}`), 409, 'remaining-below-zero');

    const { b: b2 } = await batchOf(10);
    await api.consume(b2.id, { quantity: 8 });
    const plus2 = await api.adjust(b2.id, { delta: 2, reason: 'found' });
    await api.consume(b2.id, { quantity: 2 }); // remaining 2
    expectProblem(await api.del(`/api/adjustments/${plus2.id}`), 409, 'remaining-would-be-zero');
  });

  it('DELETE refuses to lift remaining above the bought quantity', async () => {
    const { b } = await batchOf(10);
    const minus = await api.adjust(b.id, { delta: -3, reason: 'lost' });
    await api.adjust(b.id, { delta: 3, reason: 'found it' });
    expectProblem(await api.del(`/api/adjustments/${minus.id}`), 409, 'remaining-above-quantity');
  });

  it('adjustments carry no cost and are not consumptions', async () => {
    const { s, b } = await batchOf(10, 10);
    await api.consume(b.id, { quantity: 2, occurredAt: '2026-09-29T08:00:00Z' });
    await api.adjust(b.id, { delta: -3, reason: 'spilled', occurredAt: '2026-09-29T09:00:00Z' });

    const page = await api.get(`/api/batches/${b.id}`);
    expect(page.body).toMatchObject({
      consumptionCount: 1,
      avgQuantityPerConsumption: '2.000',
      avgPricePerConsumption: '2.00',
      remaining: '5.000',
    });
    const moves = await api.get(`/api/batches/${b.id}/movements`);
    expect(moves.body.map((m: any) => [m.type, m.cost])).toEqual([
      ['adjustment', null],
      ['consumption', '2.00'],
    ]);
    const stats = await api.get(`/api/stats?from=2026-09-29&to=2026-09-29&substanceId=${s.id}`);
    expect(stats.body).toEqual([{ period: '2026-09-29', consumed: '2.000', cost: '2.00', spend: '10.00' }]);
  });
});
