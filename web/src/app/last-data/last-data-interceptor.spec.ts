import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { RUNS_IN_APP } from '../connection/address';
import { Connectivity } from '../connection/connectivity';
import { ServerAddress } from '../connection/server-address';
import { errorInterceptor } from '../data/error-interceptor';
import { Session } from '../session/session';
import { LAST_DATA_BACKEND, LastDataBackend, StoredAnswer } from './last-data';
import { LAST_DATA_AT, lastDataInterceptor } from './last-data-interceptor';

/** The phone's storage, in memory. */
class MemoryBackend implements LastDataBackend {
  readonly map = new Map<string, StoredAnswer>();
  async get(key: string) {
    return this.map.get(key);
  }
  async put(key: string, answer: StoredAnswer) {
    this.map.set(key, answer);
  }
  async clear() {
    this.map.clear();
  }
}

describe('lastDataInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let phone: MemoryBackend;
  let connectivity: Connectivity;

  function setUp(inApp = true, user: { id: number } | null = { id: 7 }): void {
    phone = new MemoryBackend();
    TestBed.configureTestingModule({
      providers: [
        { provide: RUNS_IN_APP, useValue: inApp },
        { provide: LAST_DATA_BACKEND, useValue: phone },
        provideHttpClient(withInterceptors([lastDataInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(ServerAddress).set('https://tracker.example.com');
    vi.spyOn(TestBed.inject(Session), 'user').mockReturnValue(user as never);
    connectivity = TestBed.inject(Connectivity);
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve));

  afterEach(() => {
    backend.verify();
    localStorage.clear();
    vi.useRealTimers();
  });

  it('keeps every successful read, per server, user and request', async () => {
    setUp();
    const answer = firstValueFrom(http.get('/api/movements', { params: { limit: 50 } }));
    backend.expectOne('/api/movements?limit=50').flush([{ id: 1 }]);
    expect(await answer).toEqual([{ id: 1 }]);
    await settle();
    expect([...phone.map.keys()]).toEqual(['https://tracker.example.com|7|/api/movements?limit=50']);
    expect(phone.map.get('https://tracker.example.com|7|/api/movements?limit=50')).toMatchObject({ v: 1, body: [{ id: 1 }] });
  });

  it('with no answer, the read gets its last answer with its time, and the app is offline', async () => {
    setUp();
    phone.map.set('https://tracker.example.com|7|/api/substances', { v: 1, at: '2026-10-04T12:32:00.000Z', body: [{ id: 2 }] });
    const answer = firstValueFrom(http.get('/api/substances', { observe: 'response' }));
    backend.expectOne('/api/substances').error(new ProgressEvent('error'));
    const response = (await answer) as HttpResponse<unknown>;
    expect(response.body).toEqual([{ id: 2 }]);
    expect(response.headers.get(LAST_DATA_AT)).toBe('2026-10-04T12:32:00.000Z');
    expect(connectivity.offline()).toBe(true);
    expect(connectivity.dataAt()).toBe('2026-10-04T12:32:00.000Z');
  });

  it('a page never opened is "Not available offline"', async () => {
    setUp();
    const answer = firstValueFrom(http.get('/api/series')).catch((error: unknown) => error);
    backend.expectOne('/api/series').flush(null, { status: 502, statusText: 'Bad Gateway' });
    expect(await answer).toMatchObject({ code: 'not-available-offline', title: 'Not available offline' });
  });

  it('already offline, a kept read answers at once from the phone; one never kept still asks the server', async () => {
    setUp();
    phone.map.set('https://tracker.example.com|7|/api/settings', { v: 1, at: '2026-10-04T12:00:00.000Z', body: { currency: 'EUR' } });
    connectivity.unanswered();
    expect(await firstValueFrom(http.get('/api/settings'))).toEqual({ currency: 'EUR' });
    backend.expectNone('/api/settings');

    const other = firstValueFrom(http.get('/api/metrics'));
    await settle(); // the phone is asked first, then the server
    backend.expectOne('/api/metrics').flush([]);
    expect(await other).toEqual([]);
    expect(connectivity.offline()).toBe(false);
  });

  it('any answer of the server ends offline, an error too; a write is never answered from the phone', async () => {
    setUp();
    connectivity.unanswered();
    const write = firstValueFrom(http.post('/api/batches/8/consumptions', {})).catch((error: unknown) => error);
    backend.expectOne('/api/batches/8/consumptions').flush({ type: 'urn:substance-tracker:problem:conflict', title: 'Conflict', detail: 'x', errors: [] }, { status: 409, statusText: 'Conflict' });
    expect(await write).toMatchObject({ status: 409 });
    expect(connectivity.offline()).toBe(false);
  });

  it('never keeps the version, the other auth routes, or a read before a sign-in', async () => {
    setUp(true, null);
    http.get('/api/substances').subscribe();
    backend.expectOne('/api/substances').flush([]);
    TestBed.resetTestingModule();
    setUp();
    http.get('/api/version').subscribe();
    http.post('/api/auth/sign-in/username', {}).subscribe();
    backend.expectOne('/api/version').flush({ version: 'dev26.0.0', apiLevel: 1 });
    backend.expectOne('/api/auth/sign-in/username').flush({});
    await settle();
    expect(phone.map.size).toBe(0);
  });

  it('keeps who was signed in, once per server: the app opened offline starts with that user', async () => {
    setUp(true, null);
    const session = { user: { id: 7, username: 'lenzi' }, session: {} };
    http.get('/api/auth/get-session').subscribe();
    backend.expectOne('/api/auth/get-session').flush(session);
    await settle();
    expect([...phone.map.keys()]).toEqual(['https://tracker.example.com|0|/api/auth/get-session']);

    const offline = firstValueFrom(http.get('/api/auth/get-session'));
    backend.expectOne('/api/auth/get-session').error(new ProgressEvent('error'));
    expect(await offline).toEqual(session);
    expect(connectivity.offline()).toBe(true);
  });

  it('the website keeps nothing and is never offline', async () => {
    setUp(false);
    const answer = firstValueFrom(http.get('/api/substances')).catch((error: unknown) => error);
    backend.expectOne('/api/substances').error(new ProgressEvent('error'));
    expect(await answer).toMatchObject({ status: null, title: 'Server not reachable' });
    expect(connectivity.offline()).toBe(false);
    expect(phone.map.size).toBe(0);
  });
});
