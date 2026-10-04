import { TestBed } from '@angular/core/testing';

import { RUNS_IN_APP } from './address';
import { ServerAddress } from './server-address';

describe('ServerAddress', () => {
  afterEach(() => localStorage.clear());

  function make(inApp: boolean): ServerAddress {
    TestBed.configureTestingModule({ providers: [{ provide: RUNS_IN_APP, useValue: inApp }] });
    return TestBed.inject(ServerAddress);
  }

  it('in the app, keeps the address across launches, until it is cleared', () => {
    make(true).set('https://tracker.example.com');
    TestBed.resetTestingModule();
    const again = make(true);
    expect(again.address()).toBe('https://tracker.example.com');
    again.clear();
    TestBed.resetTestingModule();
    expect(make(true).address()).toBeNull();
  });

  it('the website has none, and never allows http for it', async () => {
    localStorage.setItem('substance-tracker.server', 'https://tracker.example.com');
    const website = make(false);
    expect(website.address()).toBeNull();
    expect(await website.allowsHttp()).toBe(false);
  });
});
