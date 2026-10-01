import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { ViewItem } from './view-item';
import { ViewsApi } from './views-api';

const item = (id: number, metric: string): ViewItem => ({
  id,
  surface: 'substance',
  section: null,
  position: id,
  metric,
  chart: null,
  scale: null,
  createdAt: '2026-09-29T10:00:00Z',
});

describe('ViewsApi', () => {
  let api: ViewsApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ViewsApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('lists what a surface shows', async () => {
    const result = firstValueFrom(api.list('substance'));
    const req = backend.expectOne('/api/view-items?surface=substance');
    expect(req.request.method).toBe('GET');
    req.flush([item(1, 'substance.pace')]);
    expect(await result).toEqual([item(1, 'substance.pace')]);
  });

  it('adds, removes and reorders', async () => {
    const added = firstValueFrom(api.add({ surface: 'substance', metric: 'substance.cost' }));
    const post = backend.expectOne('/api/view-items');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ surface: 'substance', metric: 'substance.cost' });
    post.flush(item(2, 'substance.cost'));
    expect(await added).toEqual(item(2, 'substance.cost'));

    const removed = firstValueFrom(api.remove(2));
    const del = backend.expectOne('/api/view-items/2');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await removed;

    const changed = firstValueFrom(api.change(5, { chart: 'line', section: null }));
    const patch = backend.expectOne('/api/view-items/5');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ chart: 'line', section: null });
    patch.flush(item(5, 'series.cost'));
    expect((await changed).id).toBe(5);

    const reordered = firstValueFrom(api.reorder('substance', [3, 1]));
    const put = backend.expectOne('/api/view-items/order');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ surface: 'substance', ids: [3, 1] });
    put.flush([item(3, 'substance.spend'), item(1, 'substance.pace')]);
    expect((await reordered).map((i) => i.id)).toEqual([3, 1]);
  });
});
