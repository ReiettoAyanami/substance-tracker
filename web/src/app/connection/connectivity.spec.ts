import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { RUNS_IN_APP } from './address';
import { Connectivity, PROBE_EVERY_MS } from './connectivity';

vi.mock('@capacitor/app', () => ({ App: { addListener: () => Promise.resolve({ remove: () => undefined }) } }));

describe('Connectivity', () => {
  let connectivity: Connectivity;
  let backend: HttpTestingController;

  function setUp(inApp: boolean): void {
    TestBed.configureTestingModule({ providers: [{ provide: RUNS_IN_APP, useValue: inApp }, provideHttpClient(), provideHttpClientTesting()] });
    connectivity = TestBed.inject(Connectivity);
    backend = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    backend.verify();
    vi.useRealTimers();
  });

  it('offline at a request without an answer, online again at the first answer', () => {
    setUp(true);
    connectivity.unanswered();
    connectivity.showedDataFrom('2026-10-04T12:32:00.000Z');
    expect(connectivity.offline()).toBe(true);
    expect(connectivity.dataAt()).toBe('2026-10-04T12:32:00.000Z');
    connectivity.answered();
    expect(connectivity.offline()).toBe(false);
    expect(connectivity.dataAt()).toBeNull();
  });

  it('while offline, asks the server every 30 s whether it is back', () => {
    vi.useFakeTimers();
    setUp(true);
    connectivity.unanswered();
    vi.advanceTimersByTime(PROBE_EVERY_MS);
    backend.expectOne('/api/version').flush({ version: 'dev26.0.0', apiLevel: 1 });
    connectivity.answered();
    vi.advanceTimersByTime(PROBE_EVERY_MS * 3);
    backend.expectNone('/api/version');
  });

  it('the website is never offline', () => {
    setUp(false);
    connectivity.unanswered();
    expect(connectivity.offline()).toBe(false);
  });
});
