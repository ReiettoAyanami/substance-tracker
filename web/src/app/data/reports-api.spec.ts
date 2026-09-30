import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { BatchListItem } from './batch';
import { Consumption, ConsumptionBounds } from './consumption';
import { OneTimeStats } from './one-time';
import { ReportsApi } from './reports-api';
import { SubstanceBatches } from './substance-batches';

describe('ReportsApi', () => {
  let api: ReportsApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ReportsApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('gets the active batches of a substance', async () => {
    const batches = { substanceId: 3, stock: '0.000', stockBarMax: '0.000', batches: [] } satisfies SubstanceBatches;
    const result = firstValueFrom(api.getSubstanceBatches(3));
    const req = backend.expectOne('/api/substances/3/batches');
    expect(req.request.method).toBe('GET');
    req.flush(batches);
    expect(await result).toEqual(batches);
  });

  it('gets the one-time totals of a substance', async () => {
    const stats = { substanceId: 4, count: 0, totalQuantity: '0.000', totalSpent: '0.00' } as OneTimeStats;
    const result = firstValueFrom(api.getOneTimeStats(4));
    backend.expectOne('/api/substances/4/one-time').flush(stats);
    expect(await result).toEqual(stats);
  });

  it('lists one page of one-time consumptions, older ones with before', async () => {
    const first = firstValueFrom(api.listOneTimeConsumptions(4, { limit: 20 }));
    backend.expectOne('/api/substances/4/one-time/consumptions?limit=20').flush([]);
    expect(await first).toEqual([]);

    const older = firstValueFrom(api.listOneTimeConsumptions(4, { limit: 20, before: '2026-09-20T19:00:00Z' }));
    backend
      .expectOne('/api/substances/4/one-time/consumptions?limit=20&before=2026-09-20T19:00:00Z')
      .flush([]);
    expect(await older).toEqual([]);
  });

  it('lists one page of consumptions with the filters that are set, older ones with before', async () => {
    const consumption = { type: 'consumption', id: 40, substanceId: 2, batchId: 8 } as Consumption;
    const first = firstValueFrom(api.listConsumptions({}, { limit: 20 }));
    backend.expectOne('/api/consumptions?limit=20').flush([consumption]);
    expect(await first).toEqual([consumption]);

    const filtered = firstValueFrom(
      api.listConsumptions(
        {
          substanceId: 2,
          batchId: 8,
          from: '2026-09-01',
          to: '2026-09-30',
          minCost: '0.3',
          maxCost: '0.5',
          minQuantity: '2',
          maxQuantity: undefined,
        },
        { limit: 20, before: '2026-09-23T20:00:00Z' },
      ),
    );
    const req = backend.expectOne(
      '/api/consumptions?substanceId=2&batchId=8&from=2026-09-01&to=2026-09-30&minCost=0.3&maxCost=0.5&minQuantity=2&limit=20&before=2026-09-23T20:00:00Z',
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
    expect(await filtered).toEqual([]);
  });

  it('gets the ends of the sliders for a scope', async () => {
    const bounds = { minCost: '0.50', maxCost: '5.00', minQuantity: '1.000', maxQuantity: '3.000' } satisfies ConsumptionBounds;
    const all = firstValueFrom(api.getConsumptionBounds());
    backend.expectOne('/api/consumptions/bounds').flush(bounds);
    expect(await all).toEqual(bounds);

    const scoped = firstValueFrom(api.getConsumptionBounds({ substanceId: 2, from: '2026-09-01' }));
    backend.expectOne('/api/consumptions/bounds?substanceId=2&from=2026-09-01').flush(bounds);
    expect(await scoped).toEqual(bounds);
  });

  it('lists every batch, or the batches of one substance', async () => {
    const batch = { id: 8, substanceId: 2, substanceName: 'Sigarette', name: null, occurredAt: '2026-09-20T10:00:00Z', deactivatedAt: null } satisfies BatchListItem;
    const all = firstValueFrom(api.listBatches());
    backend.expectOne('/api/batches').flush([batch]);
    expect(await all).toEqual([batch]);

    const ofOne = firstValueFrom(api.listBatches({ substanceId: 2 }));
    backend.expectOne('/api/batches?substanceId=2').flush([batch]);
    expect(await ofOne).toEqual([batch]);
  });
});
