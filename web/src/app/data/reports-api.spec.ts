import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

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
});
