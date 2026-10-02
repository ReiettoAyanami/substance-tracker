import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { VersionApi } from './version-api';

describe('VersionApi', () => {
  let api: VersionApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(VersionApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('gets the version of the instance', async () => {
    const result = firstValueFrom(api.getVersion());
    const req = backend.expectOne('/api/version');
    expect(req.request.method).toBe('GET');
    req.flush({ version: 'dev26.0.0' });
    expect(await result).toBe('dev26.0.0');
  });
});
