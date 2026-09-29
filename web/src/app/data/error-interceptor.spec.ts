import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { errorInterceptor } from './error-interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  /** Sends a GET and returns what the caller receives as the error. */
  function failure(respond: (url: string) => void): Promise<unknown> {
    const result = firstValueFrom(http.get('/api/x')).then(
      () => 'no error',
      (error: unknown) => error,
    );
    respond('/api/x');
    return result;
  }

  it('turns a Problem Details body into an ApiError', async () => {
    const error = await failure((url) =>
      backend.expectOne(url).flush(
        {
          type: 'urn:substance-tracker:problem:validation',
          title: 'Bad Request',
          status: 400,
          detail: 'body/name must NOT have fewer than 1 characters',
          errors: [{ field: 'name', message: 'must NOT have fewer than 1 characters' }],
        },
        { status: 400, statusText: 'Bad Request' },
      ),
    );

    expect(error).toEqual({
      status: 400,
      title: 'Bad Request',
      detail: 'body/name must NOT have fewer than 1 characters',
      fieldErrors: [{ field: 'name', message: 'must NOT have fewer than 1 characters' }],
    });
  });

  it('builds an ApiError from the status when the body is empty (e.g. the dev proxy)', async () => {
    const error = await failure((url) =>
      backend.expectOne(url).flush(null, { status: 500, statusText: 'Internal Server Error' }),
    );

    expect(error).toEqual({ status: 500, title: 'Internal Server Error', detail: '', fieldErrors: [] });
  });

  it('turns a network failure into an ApiError with no status', async () => {
    const error = await failure((url) => backend.expectOne(url).error(new ProgressEvent('error')));

    expect(error).toEqual({
      status: null,
      title: 'Network error',
      detail: 'The API could not be reached.',
      fieldErrors: [],
    });
  });
});
