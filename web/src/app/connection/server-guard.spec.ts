import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';

import { RUNS_IN_APP } from './address';
import { ServerAddress } from './server-address';
import { serverGuard } from './server-guard';

describe('serverGuard', () => {
  function guard(inApp: boolean, address: string | null): true | UrlTree {
    TestBed.configureTestingModule({ providers: [{ provide: RUNS_IN_APP, useValue: inApp }] });
    const server = TestBed.inject(ServerAddress);
    if (address) server.set(address);
    else server.clear();
    return TestBed.runInInjectionContext(() => serverGuard());
  }

  afterEach(() => localStorage.clear());

  it('the website always passes', () => {
    expect(guard(false, null)).toBe(true);
  });

  it('the app without a server address goes to the server screen', () => {
    const result = guard(true, null);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/server');
  });

  it('the app with its server address passes', () => {
    expect(guard(true, 'https://tracker.example.com')).toBe(true);
  });
});
