import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectProblem, makeApi, type Api } from '../support/api.js';
import { beerLedger } from './fixture.js';

let api: Api;
beforeAll(async () => {
  api = await makeApi();
});
afterAll(async () => {
  await api.app.close();
});

const url = (id: number, query = '') => `/api/batches/${id}/metrics${query ? `?${query}` : ''}`;

describe('GET /api/batches/:id/metrics', () => {
  it('a finished batch: its whole life, from the purchase to the consumption that finished it', async () => {
    const { a } = await beerLedger(api);
    const res = await api.get(url(a.id));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      per: 'day',
      from: null,
      to: null,
      values: {
        'batch.used': '1.0000',
        'batch.unitPriceVsAverage': '-0.2000', // 1.00 against (6 + 9) / (6 + 6) = 1.25
        'batch.unitPriceVsPrevious': null, // the first batch of beer
        'batch.valueConsumed': '6.00',
        'batch.consumptions': '3',
        'batch.avgQuantity': '2.000',
        'batch.minQuantity': '2.000',
        'batch.maxQuantity': '2.000',
        'batch.pace': '0.643', // 6 / 9 days 8 hours (09-01 10:00Z -> 09-10 18:00Z)
        'batch.waitBeforeFirst': '1.33', // 1 day 8 hours
        'batch.timeToFinish': '9.33',
        'batch.costPerTime': '0.64',
      },
    });
  });

  it('an active batch: up to now, and its expected end at its pace', async () => {
    const { b } = await beerLedger(api);
    const day = await api.get(url(b.id));
    expect(day.body.values).toEqual({
      'batch.used': '0.3333', // 2 of 6
      'batch.unitPriceVsAverage': '0.2000',
      'batch.unitPriceVsPrevious': '0.5000', // 1.50 against A's 1.00
      'batch.valueConsumed': '3.00',
      'batch.consumptions': '2',
      'batch.avgQuantity': '1.000',
      'batch.minQuantity': '1.000',
      'batch.maxQuantity': '1.000',
      'batch.pace': '0.143', // 2 / 14 days
      'batch.waitBeforeFirst': '5.33',
      'batch.timeToFinish': '42.00', // 14 days so far + 4 left at 1 every 7 days
      'batch.costPerTime': '0.21',
    });
    const week = await api.get(url(b.id, 'per=week'));
    expect(week.body.per).toBe('week');
    expect(week.body.values).toMatchObject({
      'batch.pace': '1.000',
      'batch.waitBeforeFirst': '0.76',
      'batch.timeToFinish': '6.00',
      'batch.costPerTime': '1.50',
    });
  });

  it('a batch finished by an adjustment ends when the adjustment happened', async () => {
    const tea = await api.substance({ name: 'tea', unit: 'cup' });
    const c = await api.batch(tea.id, { quantity: 5, totalPrice: '5.00', occurredAt: '2026-09-20T10:00:00Z' });
    await api.consume(c.id, { quantity: 2, occurredAt: '2026-09-21T10:00:00Z' });
    await api.adjust(c.id, { delta: -3, reason: 'spilled', occurredAt: '2026-09-23T10:00:00Z' });
    const res = await api.get(url(c.id));
    expect(res.body.values).toMatchObject({
      'batch.used': '0.4000', // what was consumed; the spilled part is not use
      'batch.valueConsumed': '2.00',
      'batch.pace': '0.667', // 2 in 3 days
      'batch.timeToFinish': '3.00',
      'batch.costPerTime': '0.67',
    });
  });

  it('a batch nothing was taken from yet', async () => {
    const tea = await api.substance({ name: 'tea', unit: 'cup' });
    const c = await api.batch(tea.id, { quantity: 5, totalPrice: '5.00', occurredAt: '2026-09-28T10:00:00Z' });
    const res = await api.get(url(c.id));
    expect(res.body.values).toEqual({
      'batch.used': '0.0000',
      'batch.unitPriceVsAverage': '0.0000', // it is the only batch
      'batch.unitPriceVsPrevious': null,
      'batch.valueConsumed': '0.00',
      'batch.consumptions': '0',
      'batch.avgQuantity': null,
      'batch.minQuantity': null,
      'batch.maxQuantity': null,
      'batch.pace': '0.000',
      'batch.waitBeforeFirst': null,
      'batch.timeToFinish': null, // no pace to reach its end
      'batch.costPerTime': '0.00',
    });
  });

  it('a deleted or unknown batch is a 404; the scale is validated; there is no period', async () => {
    const { b } = await beerLedger(api);
    const tea = await api.substance({ name: 'tea', unit: 'cup' });
    const c = await api.batch(tea.id, { quantity: 5, totalPrice: '5.00', occurredAt: '2026-09-28T10:00:00Z' });
    await api.del(`/api/batches/${c.id}`);
    expectProblem(await api.get(url(c.id)), 404, 'not-found');
    expectProblem(await api.get(url(999999)), 404, 'not-found');
    expectProblem(await api.get(url(b.id, 'per=fortnight')), 400, 'validation');
    expectProblem(await api.get(url(b.id, 'days=7')), 400, 'validation');
  });
});
