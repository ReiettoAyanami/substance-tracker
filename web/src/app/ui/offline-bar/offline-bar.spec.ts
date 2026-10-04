import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';

import { Connectivity } from '../../connection/connectivity';
import { SettingsApi } from '../../data/settings-api';
import { Session } from '../../session/session';
import { OfflineBar } from './offline-bar';

describe('OfflineBar', () => {
  const dataAt = signal<string | null>(null);
  const missing = signal(false);

  beforeEach(() => {
    // Only the clock: "now" is 4 Oct 2026, 17:00 in Rome.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-04T15:00:00Z'));
  });

  afterEach(() => vi.useRealTimers());

  async function text(): Promise<string> {
    TestBed.configureTestingModule({
      imports: [OfflineBar],
      providers: [
        { provide: Connectivity, useValue: { dataAt, missing, newPage: () => missing.set(false) } },
        { provide: Session, useValue: { user: () => ({ id: 7 }) } },
        { provide: SettingsApi, useValue: { getSettings: () => of({ timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' }) } },
      ],
    });
    const fixture = TestBed.createComponent(OfflineBar);
    await fixture.whenStable();
    return ((fixture.nativeElement as HTMLElement).querySelector('.text')?.textContent ?? '').trim();
  }

  it('the time of the data the page shows, in the time zone of the settings', async () => {
    dataAt.set('2026-10-04T12:32:00.000Z');
    expect(await text()).toBe('Offline · data from 14:32');
  });

  it('with its day when not today', async () => {
    dataAt.set('2026-09-30T07:05:00.000Z');
    expect(await text()).toBe('Offline · data from 30 Sept, 09:05');
  });

  it('"Offline" alone before any page was drawn from the phone', async () => {
    dataAt.set(null);
    expect(await text()).toBe('Offline');
  });

  it('settings the phone cannot give yet: the phone clock, and the page goes on', async () => {
    TestBed.configureTestingModule({
      imports: [OfflineBar],
      providers: [
        { provide: Connectivity, useValue: { dataAt, missing, newPage: () => missing.set(false) } },
        { provide: Session, useValue: { user: () => null } },
        { provide: SettingsApi, useValue: { getSettings: () => throwError(() => ({ status: null })) } },
      ],
    });
    dataAt.set('2026-10-04T12:32:00.000Z');
    const fixture = TestBed.createComponent(OfflineBar);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.text')?.textContent).toContain('Offline · data from');
  });

  it('a read of the page with nothing on the phone: "this page is not available offline"', async () => {
    dataAt.set('2026-10-04T12:32:00.000Z');
    missing.set(true);
    expect(await text()).toBe('Offline · this page is not available offline');
    missing.set(false);
  });
});
