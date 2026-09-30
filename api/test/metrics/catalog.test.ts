import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApi, type Api } from '../support/api.js';

let api: Api;
beforeAll(async () => {
  api = await makeApi();
});
afterAll(async () => {
  await api.app.close();
});

const ALL_SCALES = ['hour', 'day', 'week', 'month', 'year'];

describe('GET /api/metrics (the catalog)', () => {
  it('lists every metric with its key, scope, label, unit, scales, period and description', async () => {
    const res = await api.get('/api/metrics');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const m of res.body.filter((m: any) => m.scope !== 'series')) {
      expect(Object.keys(m).sort()).toEqual(['description', 'key', 'label', 'period', 'scales', 'scope', 'unit']);
      expect(m.key).toMatch(/^(substance|batch|consumption)\.[a-zA-Z]+$/);
      expect(m.key.split('.')[0]).toBe(m.scope);
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
      expect(['quantity', 'money', 'count', 'rank', 'change', 'share', 'duration', 'hours']).toContain(m.unit);
      expect(typeof m.period).toBe('boolean');
      for (const scale of m.scales) expect(ALL_SCALES).toContain(scale);
    }
    const keys = res.body.map((m: any) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(res.body.filter((m: any) => m.scope === 'series').every((m: any) => m.key.startsWith('series.'))).toBe(true);
  });

  it('has the rows of the three tables of design-statistics.md, entity by entity', async () => {
    const res = await api.get('/api/metrics');
    const keysOf = (scope: string) => res.body.filter((m: any) => m.scope === scope).map((m: any) => m.key);
    expect(keysOf('substance')).toEqual([
      'substance.consumed',
      'substance.pace',
      'substance.frequency',
      'substance.avgGap',
      'substance.sinceLast',
      'substance.longestPause',
      'substance.cost',
      'substance.spend',
      'substance.unitPriceTrend',
      'substance.stockTime',
    ]);
    // row 6 of the batch table is three numbers: average, smallest, largest
    expect(keysOf('batch')).toEqual([
      'batch.used',
      'batch.unitPriceVsAverage',
      'batch.unitPriceVsPrevious',
      'batch.valueConsumed',
      'batch.consumptions',
      'batch.avgQuantity',
      'batch.minQuantity',
      'batch.maxQuantity',
      'batch.pace',
      'batch.waitBeforeFirst',
      'batch.timeToFinish',
      'batch.costPerTime',
    ]);
    // row 7 of the consumption table is three numbers: of the substance, of its batch, of its day
    expect(keysOf('consumption')).toEqual([
      'consumption.deltaQuantity',
      'consumption.quantityVsSubstanceAverage',
      'consumption.quantityVsBatchAverage',
      'consumption.deltaCost',
      'consumption.unitPriceVsStock',
      'consumption.unitPriceVsBatches',
      'consumption.rankInSubstance',
      'consumption.rankInBatch',
      'consumption.rankInDay',
      'consumption.sincePrevious',
      'consumption.hourVsUsual',
      'consumption.shareOfBatch',
    ]);
  });

  it('the user chooses the scale of every rate and every duration; none where the scale is the meaning', async () => {
    const res = await api.get('/api/metrics');
    res.body = res.body.filter((m: any) => m.scope !== 'series');
    for (const m of res.body) {
      if (m.unit === 'duration') expect(m.scales, m.key).toEqual(ALL_SCALES);
      if (['rank', 'hours', 'change', 'share'].includes(m.unit)) expect(m.scales, m.key).toEqual([]);
    }
    const scaled = res.body.filter((m: any) => m.scales.length > 0).map((m: any) => m.key);
    expect(scaled).toEqual([
      'substance.pace',
      'substance.frequency',
      'substance.avgGap',
      'substance.sinceLast',
      'substance.longestPause',
      'substance.stockTime',
      'batch.pace',
      'batch.waitBeforeFirst',
      'batch.timeToFinish',
      'batch.costPerTime',
      'consumption.sincePrevious',
    ]);
  });

  it('only the substance metrics follow the period, except the time since the last one', async () => {
    const res = await api.get('/api/metrics');
    res.body = res.body.filter((m: any) => m.scope !== 'series');
    const withPeriod = res.body.filter((m: any) => m.period).map((m: any) => m.key);
    expect(withPeriod).toEqual([
      'substance.consumed',
      'substance.pace',
      'substance.frequency',
      'substance.avgGap',
      'substance.longestPause',
      'substance.cost',
      'substance.spend',
      'substance.unitPriceTrend',
      'substance.stockTime',
    ]);
  });
});
