import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { DownloadApi } from './download-api';
import { errorInterceptor } from './error-interceptor';

describe('DownloadApi', () => {
  let api: DownloadApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    api = TestBed.inject(DownloadApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('asks with HEAD whether the instance carries the APK', async () => {
    const result = firstValueFrom(api.hasApk());
    const req = backend.expectOne('/download/substance.apk');
    expect(req.request.method).toBe('HEAD');
    req.flush(null);
    expect(await result).toBe(true);
  });

  it('a 404 means no APK; any other failure stays an error', async () => {
    const none = firstValueFrom(api.hasApk());
    backend.expectOne('/download/substance.apk').flush(null, { status: 404, statusText: 'Not Found' });
    expect(await none).toBe(false);

    const failed = firstValueFrom(api.hasApk()).then(
      () => 'no error',
      (error: { status: number | null }) => error.status,
    );
    backend.expectOne('/download/substance.apk').flush(null, { status: 500, statusText: 'Internal Server Error' });
    expect(await failed).toBe(500);
  });
});
