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

const table = (query: string) => api.get(`/api/metrics/table?${query}`);

describe('GET /api/metrics/table?scope=substance', () => {
  it('one row per substance (by name), with the metrics asked, in the scale and the period asked', async () => {
    const { beer, coffee } = await beerLedger(api);
    const res = await table('scope=substance&keys=substance.consumed,substance.pace&per=week');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      scope: 'substance',
      per: 'week',
      from: null,
      to: null,
      keys: ['substance.consumed', 'substance.pace'],
      rows: [
        { id: beer.id, name: 'beer', unit: 'beer', values: { 'substance.consumed': '9.000', 'substance.pace': '2.250' } },
        { id: coffee.id, name: 'coffee', unit: 'cup', values: expect.objectContaining({ 'substance.consumed': '1.000' }) },
      ],
    });
  });

  it('the same numbers as each substance has on its own page: one computation', async () => {
    const { beer, coffee } = await beerLedger(api);
    for (const query of ['per=day', 'per=month&days=7', 'per=hour&from=2026-09-01&to=2026-09-10']) {
      const res = await table(`scope=substance&${query}`);
      for (const substance of [beer, coffee]) {
        const own = await api.get(`/api/substances/${substance.id}/metrics?${query}`);
        expect(res.body.rows.find((r: any) => r.id === substance.id).values, `${substance.name} ${query}`).toEqual(own.body.values);
      }
    }
  });

  it('without keys, every metric of the scope; with days, the period resolved', async () => {
    await beerLedger(api);
    const res = await table('scope=substance&days=7');
    expect(res.body.keys).toHaveLength(10);
    expect(Object.keys(res.body.rows[0].values)).toEqual(res.body.keys);
    expect([res.body.from, res.body.to]).toEqual(['2026-09-23', '2026-09-29']);
  });

  it('leaves out archived and deleted substances', async () => {
    const { beer, coffee } = await beerLedger(api);
    const tea = await api.substance({ name: 'tea', unit: 'cup' });
    await api.patch(`/api/substances/${coffee.id}`, { archived: true });
    await api.del(`/api/substances/${tea.id}`);
    const res = await table('scope=substance&keys=substance.cost');
    expect(res.body.rows.map((r: any) => r.id)).toEqual([beer.id]);
  });

  it('validates the scope, the keys, the scale and the period', async () => {
    expectProblem(await table('scope=kitchen'), 400, 'validation');
    expectProblem(await table(''), 400, 'validation');
    expectProblem(await table('scope=substance&keys=substance.nothing'), 400, 'validation');
    expectProblem(await table('scope=substance&keys=batch.used'), 400, 'validation');
    expectProblem(await table('scope=substance&per=fortnight'), 400, 'validation');
    expectProblem(await table('scope=substance&days=7&to=2026-09-01'), 400, 'validation');
  });
});
