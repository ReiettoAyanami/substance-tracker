import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { SettingsApi } from './settings-api';

describe('SettingsApi', () => {
  let api: SettingsApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(SettingsApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('gets the settings', async () => {
    const settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };
    const result = firstValueFrom(api.getSettings());
    const req = backend.expectOne('/api/settings');
    expect(req.request.method).toBe('GET');
    req.flush(settings);
    expect(await result).toEqual(settings);
  });
});
