import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { APP_API_LEVEL, APP_VERSION } from '../app-version';
import { RUNS_IN_APP } from './address';
import { Compatibility, standingOf } from './compatibility';
import { Connectivity } from './connectivity';
import { ServerAddress } from './server-address';

vi.mock('@capacitor/app', () => ({ App: { addListener: () => Promise.resolve({ remove: () => undefined }) } }));

describe('standingOf', () => {
  const app = { version: 'a26.1.4', apiLevel: 2 };

  it('the API level decides; the version alone only says a new one is there', () => {
    expect(standingOf({ version: 'a26.1.4', apiLevel: 2 }, app)).toBe('same');
    // A backend fix: another version, the same level.
    expect(standingOf({ version: 'a26.2.0', apiLevel: 2 }, app)).toBe('newer-version');
    // Even another year.
    expect(standingOf({ version: 'a27.0.0', apiLevel: 2 }, app)).toBe('newer-version');
    expect(standingOf({ version: 'a26.3.0', apiLevel: 3 }, app)).toBe('app-older');
    expect(standingOf({ version: 'a26.0.9', apiLevel: 1 }, app)).toBe('server-older');
  });
});

describe('Compatibility', () => {
  let backend: HttpTestingController;

  function setUp(inApp = true): Compatibility {
    TestBed.configureTestingModule({ providers: [{ provide: RUNS_IN_APP, useValue: inApp }, provideHttpClient(), provideHttpClientTesting()] });
    TestBed.inject(ServerAddress).set('https://tracker.example.com');
    backend = TestBed.inject(HttpTestingController);
    const compatibility = TestBed.inject(Compatibility);
    TestBed.tick();
    return compatibility;
  }

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  it('asks the server at launch, and stops the app for another API level', () => {
    const compatibility = setUp();
    backend.expectOne('/api/version').flush({ version: 'v27.0.0', apiLevel: APP_API_LEVEL + 1 });
    expect(compatibility.standing()).toBe('app-older');
    expect(compatibility.blocked()).toBe(true);
  });

  it('asks again when the server answers after being offline; offline the last standing holds', () => {
    const compatibility = setUp();
    backend.expectOne('/api/version').flush({ version: APP_VERSION, apiLevel: APP_API_LEVEL });
    expect(compatibility.standing()).toBe('same');
    const connectivity = TestBed.inject(Connectivity);
    connectivity.unanswered();
    TestBed.tick();
    compatibility.check();
    backend.expectOne('/api/version').error(new ProgressEvent('error'));
    expect(compatibility.standing()).toBe('same');
    connectivity.answered();
    TestBed.tick();
    backend.expectOne('/api/version').flush({ version: 'other', apiLevel: APP_API_LEVEL });
    expect(compatibility.standing()).toBe('newer-version');
    expect(compatibility.blocked()).toBe(false);
  });

  it('the website checks nothing', () => {
    const compatibility = setUp(false);
    backend.expectNone('/api/version');
    expect(compatibility.blocked()).toBe(false);
  });
});
