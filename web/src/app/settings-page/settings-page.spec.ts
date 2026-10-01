import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { ApiError } from '../data/api-error';
import { Settings } from '../data/settings';
import { SettingsApi } from '../data/settings-api';
import { Appearance } from '../ui/appearance';
import { SettingsPage } from './settings-page';

describe('SettingsPage', () => {
  let fixture: ComponentFixture<SettingsPage>;
  let stored: Settings;
  let sent: Partial<Settings>[];
  let answer: (patch: Partial<Settings>) => Observable<Settings>;
  let snacks: string[];

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const input = (name: string) => element().querySelector<HTMLInputElement>(`input[formControlName="${name}"]`)!;
  const saveButton = () => element().querySelector<HTMLButtonElement>('button[type="submit"]')!;

  async function type(name: string, value: string): Promise<void> {
    const field = input(name);
    field.focus();
    field.value = value;
    field.dispatchEvent(new Event('input'));
    field.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }

  async function save(): Promise<void> {
    saveButton().click();
    await fixture.whenStable();
  }

  async function open(): Promise<void> {
    fixture = TestBed.createComponent(SettingsPage);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    stored = { timezone: 'Europe/Rome', dayStartsAt: '04:00:00', currency: 'EUR' };
    sent = [];
    snacks = [];
    answer = (patch) => {
      stored = { ...stored, ...patch, ...(patch.dayStartsAt ? { dayStartsAt: `${patch.dayStartsAt}:00` } : {}) };
      return of(stored);
    };
    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        provideRouter([]),
        {
          provide: SettingsApi,
          useValue: {
            getSettings: () => of(stored),
            updateSettings: (patch: Partial<Settings>) => (sent.push(patch), answer(patch)),
          },
        },
        { provide: MatSnackBar, useValue: { open: (message: string) => snacks.push(message) } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
  });

  it('shows the settings the API has; nothing to save yet', async () => {
    await open();

    expect([input('currency').value, input('timezone').value, input('dayStartsAt').value]).toEqual(['EUR', 'Europe/Rome', '04:00']);
    expect(saveButton().disabled).toBe(true);
  });

  it('saves only what changed, then shows what the API saved', async () => {
    await open();
    await type('currency', 'GBP');
    expect(saveButton().disabled).toBe(false);
    await save();

    expect(sent).toEqual([{ currency: 'GBP' }]);
    expect(snacks).toEqual(['Settings saved']);
    expect(input('currency').value).toBe('GBP');
    expect(saveButton().disabled).toBe(true);
  });

  it('the time zone and the start of the day, sent as the API reads them', async () => {
    await open();
    await type('timezone', 'Europe/London');
    await type('dayStartsAt', '05:30');
    await save();

    expect(sent).toEqual([{ timezone: 'Europe/London', dayStartsAt: '05:30' }]);
    expect(input('dayStartsAt').value).toBe('05:30');
  });

  it('refuses a currency or a time zone that is not one of the list, before sending', async () => {
    await open();
    await type('currency', 'EURO');
    await type('timezone', 'Mars/Olympus');
    await save();

    expect(sent).toEqual([]);
    expect(Array.from(element().querySelectorAll('mat-error')).map(text)).toEqual(['Choose one of the list', 'Choose one of the list']);
  });

  it('offers the currencies by code and name, the time zones by name, filtered by what is typed', async () => {
    await open();
    await type('currency', 'franc');
    input('currency').focus();
    input('currency').dispatchEvent(new Event('focusin'));
    await fixture.whenStable();
    const currencies = Array.from(document.querySelectorAll('mat-option')).map(text);
    expect(currencies).toContain('CHF · Swiss Franc');
    expect(currencies.every((o) => o.toLowerCase().includes('franc'))).toBe(true);
  });

  it("puts the API's errors under their field, the others above the button", async () => {
    answer = () =>
      throwError(
        (): ApiError => ({
          status: 400,
          title: 'Bad Request',
          detail: 'invalid',
          fieldErrors: [{ field: 'timezone', message: 'timezone "Europe/London" is not a valid IANA time zone' }],
        }),
      );
    await open();
    await type('timezone', 'Europe/London');
    await save();

    expect(text(element().querySelector('.timezone mat-error'))).toBe('timezone "Europe/London" is not a valid IANA time zone');
    expect(saveButton().disabled).toBe(false);

    answer = () => throwError((): ApiError => ({ status: null, title: 'No connection', detail: '', fieldErrors: [] }));
    await type('timezone', 'Europe/Paris'); // a new value clears the API's error
    await save();
    expect(text(element().querySelector('.form-error'))).toBe('Could not save: No connection');
  });

  it('"Reduce transparency" makes the windows solid at once, without saving anything to the API', async () => {
    localStorage.clear();
    await open();
    const toggle = element().querySelector('.display mat-slide-toggle');
    expect(text(toggle)).toContain('Reduce transparency');
    expect(TestBed.inject(Appearance).reduceTransparency()).toBe(false);

    toggle!.querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();

    expect(TestBed.inject(Appearance).reduceTransparency()).toBe(true);
    expect(document.documentElement.classList.contains('reduce-transparency')).toBe(true);
    expect(sent).toEqual([]);
    TestBed.inject(Appearance).setReduceTransparency(false);
  });

  it('says that the zone and the start of the day move consumptions between days, and links to what the pages show', async () => {
    await open();

    expect(text(element().querySelector('.note'))).toContain('moves consumptions between days');
    const link = element().querySelector<HTMLAnchorElement>('a[href="/statistics/edit"]');
    expect(text(link)).toContain('What the pages show');
  });
});
