import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { CatalogApi } from './catalog-api';
import { Substance } from './substance';

describe('CatalogApi', () => {
  let api: CatalogApi;
  let backend: HttpTestingController;

  const beer = { id: 1, name: 'Beer' } as Substance;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(CatalogApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('lists the substances, archived ones only on request', async () => {
    const active = firstValueFrom(api.listSubstances());
    const activeReq = backend.expectOne('/api/substances');
    expect(activeReq.request.method).toBe('GET');
    activeReq.flush([beer]);
    expect(await active).toEqual([beer]);

    const all = firstValueFrom(api.listSubstances({ archived: true }));
    backend.expectOne('/api/substances?archived=true').flush([beer]);
    expect(await all).toEqual([beer]);
  });

  it('gets one substance by id', async () => {
    const result = firstValueFrom(api.getSubstance(1));
    const req = backend.expectOne('/api/substances/1');
    expect(req.request.method).toBe('GET');
    req.flush(beer);
    expect(await result).toEqual(beer);
  });

  it('creates a substance and returns the created one', async () => {
    const input = { name: 'Beer', unit: 'bottle', refillQuantity: '6' };
    const result = firstValueFrom(api.createSubstance(input));
    const req = backend.expectOne('/api/substances');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    req.flush(beer, { status: 201, statusText: 'Created' });
    expect(await result).toEqual(beer);
  });

  it('changes a substance and returns the changed one', async () => {
    const input = { name: 'Beer', refillQuantity: null };
    const result = firstValueFrom(api.updateSubstance(1, input));
    const req = backend.expectOne('/api/substances/1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(input);
    req.flush(beer);
    expect(await result).toEqual(beer);
  });

  it('deletes a substance', async () => {
    const result = firstValueFrom(api.deleteSubstance(1));
    const req = backend.expectOne('/api/substances/1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(await result).toBeNull();
  });
});
