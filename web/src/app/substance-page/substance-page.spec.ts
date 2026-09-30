import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { By } from '@angular/platform-browser';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { routes } from '../app.routes';
import { ReportsApi } from '../data/reports-api';
import { Substance } from '../data/substance';
import { SubstanceBatches } from '../data/substance-batches';
import { BatchList } from './batch-list/batch-list';
import { OneTimeList } from './one-time-list/one-time-list';

const settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };

function substance(id: number, name: string): Substance {
  return {
    id,
    name,
    unit: 'g',
    refillQuantity: null,
    archived: false,
    archivedAt: null,
    createdAt: '2026-09-01T10:00:00Z',
    summary: {
      stock: '0.000',
      stockBarMax: '0.000',
      stockBarSegments: [],
      peakStock: '0.000',
      lastBatch: null,
      avgUnitPrice: null,
      lastConsumption: null,
      avgQuantityPerConsumption: null,
      avgPricePerConsumption: null,
      spendThisMonth: '0.00',
    },
  };
}

/** The batches of every substance: one, 4 g left of 10. */
const batchesOf = (substanceId: number): SubstanceBatches => ({
  substanceId,
  stock: '4.000',
  stockBarMax: '10.000',
  batches: [
    {
      id: 20 + substanceId,
      name: null,
      occurredAt: '2026-09-01T10:00:00Z',
      quantity: '10.000',
      remaining: '4.000',
      unitPrice: '1.000000',
      totalPrice: '10.00',
      shareByQuantity: '1.0000',
      shareByValue: '1.0000',
      note: null,
      deactivatedAt: null,
    },
  ],
});

/** The list's order: Birra (4), Caffè (1), Erba (3). */
const listOrder = [substance(4, 'Birra'), substance(1, 'Caffè'), substance(3, 'Erba')];

describe('SubstancePage', () => {
  let harness: RouterTestingHarness;

  /** Opens a URL the way a direct link or a refresh does, with the list's data. */
  async function open(url: string): Promise<HTMLElement> {
    harness = await RouterTestingHarness.create(url);
    const backend = TestBed.inject(HttpTestingController);
    backend.expectOne('/api/settings').flush(settings);
    backend.expectOne('/api/substances').flush(listOrder);
    await harness.fixture.whenStable();
    return harness.routeNativeElement!;
  }

  const page = () => document.querySelector<HTMLElement>('app-substance-page');
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes, withComponentInputBinding()),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        {
          provide: ReportsApi,
          useValue: {
            getSubstanceBatches: (id: number) => of(batchesOf(id)),
            getOneTimeStats: (id: number) => of({ substanceId: id, count: 0, totalQuantity: '0.000', totalSpent: '0.00' }),
            listOneTimeConsumptions: () => of([]),
          },
        },
      ],
    });
  });

  it('shows the substance of the link over the list, with its position in the list order', async () => {
    await open('/substances/1');

    expect(document.querySelectorAll('app-substances-page app-substance-card').length).toBe(4); // 3 in the list + 1 in the page
    expect(text(page()?.querySelector('app-substance-card .name'))).toBe('Caffè');
    expect(text(page()?.querySelector('.position'))).toBe('2 / 3');
  });

  it('shows the total of the active batches and of the one-time consumptions below the card', async () => {
    await open('/substances/1');

    expect(text(page()?.querySelector('app-batch-list .total'))).toBe('1 batch · 4 / 10 g');
    expect(text(page()?.querySelector('app-one-time-list .total'))).toBe('No consumptions');
  });

  it('closes onto the list when its substance is deleted from its card', async () => {
    await open('/substances/1');
    page()!.querySelector<HTMLButtonElement>('app-substance-card button.more')!.click();
    await harness.fixture.whenStable();
    Array.from(document.querySelectorAll<HTMLButtonElement>('.mat-mdc-menu-item'))
      .find((b) => b.textContent?.includes('Delete'))!
      .click();
    await harness.fixture.whenStable();
    Array.from(document.querySelectorAll<HTMLButtonElement>('app-delete-substance-dialog button'))
      .find((b) => b.textContent?.trim() === 'Delete')!
      .click();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/substances/1')
      .flush(null, { status: 204, statusText: 'No Content' });
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await harness.fixture.whenStable();
    }

    expect(TestBed.inject(Router).url).toBe('/substances');
    expect(page()).toBeNull();
    const names = Array.from(document.querySelectorAll('app-substances-page app-substance-card .name')).map(text);
    expect(names).toEqual(['Birra', 'Erba']);
  });

  it('goes to the next and previous substance of the list order, replacing the route (back still closes)', async () => {
    await open('/substances/1');
    const button = (label: string) => page()!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    const entries = history.length;

    button('Next substance').click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/substances/3');
    expect(text(page()?.querySelector('app-substance-card .name'))).toBe('Erba');
    expect(text(page()?.querySelector('.position'))).toBe('3 / 3');
    expect(button('Next substance').disabled).toBe(true);

    button('Previous substance').click();
    await harness.fixture.whenStable();
    button('Previous substance').click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/substances/4');
    expect(button('Previous substance').disabled).toBe(true);
    expect(history.length).toBe(entries);
  });

  it('from a direct link, X and a tap on the backdrop close it onto the list', async () => {
    await open('/substances/1');
    const back = vi.spyOn(TestBed.inject(Location), 'back');

    page()!.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/substances');
    expect(page()).toBeNull();

    await harness.navigateByUrl('/substances/3');
    page()!.querySelector<HTMLElement>('.backdrop')!.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/substances');
    expect(back).not.toHaveBeenCalled();
  });

  it('opens from a card of the list; closing then goes back in history, also after prev/next', async () => {
    await open('/substances');
    const erba = Array.from(document.querySelectorAll<HTMLElement>('app-substances-page app-substance-card')).find(
      (card) => text(card.querySelector('.name')) === 'Erba',
    )!;
    erba.querySelector<HTMLElement>('.last-purchase')!.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/substances/3');
    expect(text(page()?.querySelector('app-substance-card .name'))).toBe('Erba');

    const back = vi.spyOn(TestBed.inject(Location), 'back');
    page()!.querySelector<HTMLButtonElement>('button[aria-label="Previous substance"]')!.click();
    await harness.fixture.whenStable();
    page()!.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('asks its substance again when a batch was written in its batch list: the card changes here and in the list underneath', async () => {
    await open('/substances/1');
    const bars = () => document.querySelectorAll('app-substances-page app-substance-card .segment').length;
    expect(bars()).toBe(0);

    const batchList = harness.fixture.debugElement.query(By.directive(BatchList)).componentInstance as BatchList;
    batchList.changed.emit();
    const restocked = substance(1, 'Caffè');
    restocked.summary = {
      ...restocked.summary,
      stock: '4.000',
      stockBarMax: '10.000',
      stockBarSegments: [{ batchId: 21, name: null, remaining: '4.000', unitPrice: '1.000000' }],
    };
    TestBed.inject(HttpTestingController).expectOne('/api/substances/1').flush(restocked);
    await harness.fixture.whenStable();

    expect(bars()).toBe(2); // the card of the page and the one in the list
    expect(TestBed.inject(Router).url).toBe('/substances/1');
  });

  it('asks its substance again also when a one-time consumption was added in its one-time list', async () => {
    await open('/substances/1');

    const oneTimeList = harness.fixture.debugElement.query(By.directive(OneTimeList)).componentInstance as OneTimeList;
    oneTimeList.changed.emit();
    TestBed.inject(HttpTestingController).expectOne('/api/substances/1').flush(substance(1, 'Caffè'));
    await harness.fixture.whenStable();

    expect(text(page()?.querySelector('app-substance-card .name'))).toBe('Caffè');
  });

  it('closes on Esc, unless something open over it (a dialog, a menu) already took the key', async () => {
    await open('/substances/1');

    const taken = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    taken.preventDefault(); // as the dialog or the menu on top does when it closes itself
    document.dispatchEvent(taken);
    await harness.fixture.whenStable();
    expect(page()).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await harness.fixture.whenStable();
    expect(page()).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/substances');
  });

  it('says so when the substance is not in the list (an old link, an archived substance)', async () => {
    await open('/substances/99');

    expect(text(page()?.querySelector('.missing'))).toBe('Substance not found');
    expect(page()?.querySelector('app-substance-card')).toBeNull();
    expect(page()?.querySelector('button[aria-label="Close"]')).not.toBeNull();
  });
});
