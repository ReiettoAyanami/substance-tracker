import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { MetricDefinition, MetricsResult, MetricsTable } from './metric';
import { MetricsApi } from './metrics-api';
import { SeriesData } from './series';

describe('MetricsApi', () => {
  let api: MetricsApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(MetricsApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('gets the catalog', async () => {
    const catalog = [{ key: 'substance.pace', scope: 'substance' } as MetricDefinition];
    const result = firstValueFrom(api.getCatalog());
    const req = backend.expectOne('/api/metrics');
    expect(req.request.method).toBe('GET');
    req.flush(catalog);
    expect(await result).toEqual(catalog);
  });

  it('gets a series, its substances comma-separated', async () => {
    const data = { metric: 'series.cost', per: 'week', by: 'substance', from: '2026-09-01', to: '2026-09-30', periods: [], series: [] } as SeriesData;
    const result = firstValueFrom(api.getSeries({ metric: 'series.cost', per: 'week', days: 30, substanceIds: [4, 1] }));
    backend.expectOne('/api/series?metric=series.cost&per=week&days=30&substanceIds=4,1').flush(data);
    expect(await result).toEqual(data);

    const all = firstValueFrom(api.getSeries({ metric: 'series.hourOfDay', by: 'batch' }));
    backend.expectOne('/api/series?metric=series.hourOfDay&by=batch').flush(data);
    expect(await all).toEqual(data);
  });

  it('gets a table of the metrics page, its keys comma-separated', async () => {
    const table = { scope: 'substance', per: 'day', from: null, to: null, keys: [], rows: [] } as MetricsTable;
    const result = firstValueFrom(api.getTable({ scope: 'substance', keys: ['substance.pace', 'substance.cost'], per: 'day', days: 30 }));
    backend.expectOne('/api/metrics/table?scope=substance&per=day&days=30&keys=substance.pace,substance.cost').flush(table);
    expect(await result).toEqual(table);
  });

  it("gets a consumption's metrics, of a batch or one-time", async () => {
    const metrics: MetricsResult = { per: 'day', from: null, to: null, values: { 'consumption.rankInDay': '2' } };
    const batch = firstValueFrom(api.getConsumptionMetrics('consumption', 40, { per: 'day' }));
    backend.expectOne('/api/consumptions/40/metrics?per=day').flush(metrics);
    expect(await batch).toEqual(metrics);
    const oneTime = firstValueFrom(api.getConsumptionMetrics('one_time', 9));
    backend.expectOne('/api/one-time-consumptions/9/metrics').flush(metrics);
    expect(await oneTime).toEqual(metrics);
  });

  it("gets a batch's metrics, in the scale asked", async () => {
    const metrics: MetricsResult = { per: 'week', from: null, to: null, values: { 'batch.pace': '1.000' } };
    const result = firstValueFrom(api.getBatchMetrics(7, { per: 'week' }));
    backend.expectOne('/api/batches/7/metrics?per=week').flush(metrics);
    expect(await result).toEqual(metrics);
  });

  it("gets a substance's metrics, with the scale and the period that are set", async () => {
    const metrics: MetricsResult = { per: 'week', from: '2026-09-23', to: '2026-09-29', values: { 'substance.pace': '2.250' } };
    const result = firstValueFrom(api.getSubstanceMetrics(4, { per: 'week', days: 7 }));
    backend.expectOne('/api/substances/4/metrics?per=week&days=7').flush(metrics);
    expect(await result).toEqual(metrics);

    const allTime = firstValueFrom(api.getSubstanceMetrics(4));
    backend.expectOne('/api/substances/4/metrics').flush(metrics);
    expect(await allTime).toEqual(metrics);
  });
});
