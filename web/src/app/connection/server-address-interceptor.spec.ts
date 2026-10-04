import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { RUNS_IN_APP } from './address';
import { ServerAddress } from './server-address';
import { serverAddressInterceptor } from './server-address-interceptor';

describe('serverAddressInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  function setUp(inApp: boolean, address: string | null): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: RUNS_IN_APP, useValue: inApp },
        provideHttpClient(withInterceptors([serverAddressInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    if (address) TestBed.inject(ServerAddress).set(address);
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  it('in the app, puts the API and the download on the server address', () => {
    setUp(true, 'https://tracker.example.com');
    http.get('/api/substances').subscribe();
    http.head('/download/substance.apk').subscribe();
    backend.expectOne('https://tracker.example.com/api/substances').flush([]);
    backend.expectOne('https://tracker.example.com/download/substance.apk').flush(null);
  });

  it('leaves absolute addresses and other paths alone', () => {
    setUp(true, 'https://tracker.example.com');
    http.get('https://other.example.com/api/version').subscribe();
    http.get('/media/x.png').subscribe();
    backend.expectOne('https://other.example.com/api/version').flush({});
    backend.expectOne('/media/x.png').flush(null);
  });

  it('the website keeps its relative paths', () => {
    setUp(false, null);
    http.get('/api/substances').subscribe();
    backend.expectOne('/api/substances').flush([]);
  });
});
