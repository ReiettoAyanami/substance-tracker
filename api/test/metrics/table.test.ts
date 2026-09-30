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

describe('GET /api/metrics/table?scope=batch', () => {
  it('one row per batch, by substance (name) and newest first, with the numbers of each batch', async () => {
    const { beer, coffee, a, b, coffeeBatch } = await beerLedger(api);
    const res = await table('scope=batch&keys=batch.used,batch.pace&per=week');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.keys).toEqual(['batch.used', 'batch.pace']);
    expect(res.body.rows.map((r: any) => [r.substanceName, r.name, r.id])).toEqual([
      ['beer', 'B', b.id],
      ['beer', 'A', a.id],
      ['coffee', null, coffeeBatch.id],
    ]);
    expect(res.body.rows[0]).toEqual({
      id: b.id,
      substanceId: beer.id,
      substanceName: 'beer',
      unit: 'beer',
      name: 'B',
      occurredAt: '2026-09-15T10:00:00Z',
      deactivatedAt: null,
      values: { 'batch.used': '0.3333', 'batch.pace': '1.000' },
    });
    expect(res.body.rows[1].deactivatedAt).not.toBeNull();
    expect(res.body.rows[2].substanceId).toBe(coffee.id);
  });

  it('the same numbers as each batch has on its own page', async () => {
    const { a, b, coffeeBatch } = await beerLedger(api);
    const res = await table('scope=batch&per=hour');
    for (const batch of [a, b, coffeeBatch]) {
      const own = await api.get(`/api/batches/${batch.id}/metrics?per=hour`);
      expect(res.body.rows.find((r: any) => r.id === batch.id).values).toEqual(own.body.values);
    }
  });

  it('the period keeps the batches bought in it; substanceId those of one substance', async () => {
    const { beer, b } = await beerLedger(api);
    expect((await table('scope=batch&from=2026-09-10')).body.rows.map((r: any) => r.id)).toEqual([b.id]);
    expect((await table('scope=batch&days=7')).body.rows).toEqual([]);
    const beers = await table(`scope=batch&substanceId=${beer.id}&keys=batch.used`);
    expect(beers.body.rows.map((r: any) => r.substanceName)).toEqual(['beer', 'beer']);
    expectProblem(await table('scope=batch&substanceId=999999'), 404, 'not-found');
    expectProblem(await table('scope=batch&keys=substance.pace'), 400, 'validation');
  });

  it('leaves out deleted batches, and those of archived substances unless one is asked', async () => {
    const { beer, a, b } = await beerLedger(api);
    await api.patch(`/api/substances/${beer.id}`, { archived: true });
    expect((await table('scope=batch')).body.rows.map((r: any) => r.substanceName)).toEqual(['coffee']);
    expect((await table(`scope=batch&substanceId=${beer.id}`)).body.rows.map((r: any) => r.id)).toEqual([b.id, a.id]);
  });
});

describe('GET /api/metrics/table?scope=consumption', () => {
  it('the consumptions made in the period, of both kinds, newest first, with their numbers', async () => {
    const { beer, coffee, b, c5, c4, o1 } = await beerLedger(api);
    const res = await table('scope=consumption&keys=consumption.rankInSubstance,consumption.deltaCost');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.rows.map((r: any) => [r.substanceName, r.type, r.values['consumption.rankInSubstance']])).toEqual([
      ['coffee', 'consumption', '1'],
      ['beer', 'consumption', '6'],
      ['beer', 'consumption', '5'],
      ['beer', 'one_time', '4'],
      ['beer', 'consumption', '3'],
      ['beer', 'consumption', '2'],
      ['beer', 'consumption', '1'],
    ]);
    expect(res.body.rows[1]).toEqual({
      type: 'consumption',
      id: c5.id,
      substanceId: beer.id,
      substanceName: 'beer',
      unit: 'beer',
      batchId: b.id,
      batchName: 'B',
      name: null,
      occurredAt: '2026-09-25T20:00:00Z',
      quantity: '1.000',
      values: { 'consumption.rankInSubstance': '6', 'consumption.deltaCost': '0.0000' },
    });
    expect(res.body.rows[3]).toMatchObject({ type: 'one_time', id: o1.id, batchId: null, batchName: null, name: 'bar' });
    expect(res.body.rows[0].substanceId).toBe(coffee.id);
    expect(res.body.rows[2].id).toBe(c4.id);
  });

  it('the same numbers as each consumption has on its own', async () => {
    const { c4, o1 } = await beerLedger(api);
    const res = await table('scope=consumption&per=hour');
    const own = async (url: string) => (await api.get(url)).body.values;
    expect(res.body.rows.find((r: any) => r.type === 'consumption' && r.id === c4.id).values).toEqual(
      await own(`/api/consumptions/${c4.id}/metrics?per=hour`),
    );
    expect(res.body.rows.find((r: any) => r.type === 'one_time' && r.id === o1.id).values).toEqual(
      await own(`/api/one-time-consumptions/${o1.id}/metrics?per=hour`),
    );
  });

  it('the period, one substance, one batch (no one-time ones), and a limit', async () => {
    const { beer, a, b } = await beerLedger(api);
    const ids = async (query: string) => (await table(`scope=consumption&keys=consumption.rankInDay&${query}`)).body.rows.map((r: any) => r.occurredAt);
    expect(await ids('days=7')).toEqual(['2026-09-27T08:00:00Z', '2026-09-25T20:00:00Z']);
    expect(await ids(`substanceId=${beer.id}&from=2026-09-11`)).toEqual([
      '2026-09-25T20:00:00Z',
      '2026-09-20T18:00:00Z',
      '2026-09-12T20:00:00Z',
    ]);
    expect(await ids(`batchId=${a.id}`)).toEqual(['2026-09-10T18:00:00Z', '2026-09-05T18:00:00Z', '2026-09-02T18:00:00Z']);
    expect(await ids(`batchId=${b.id}&limit=1`)).toEqual(['2026-09-25T20:00:00Z']);
    expectProblem(await table('scope=consumption&batchId=999999'), 404, 'not-found');
    expectProblem(await table('scope=consumption&limit=0'), 400, 'validation');
    expectProblem(await table('scope=substance&batchId=1'), 400, 'validation');
  });
});
