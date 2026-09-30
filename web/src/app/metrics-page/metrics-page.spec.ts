import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of, throwError } from 'rxjs';

import { ConsumptionActions } from '../consumptions-page/consumption-actions';
import { CatalogApi } from '../data/catalog-api';
import { MetricDefinition, MetricsTable, MetricsTableQuery } from '../data/metric';
import { MetricsApi } from '../data/metrics-api';
import { ReportsApi } from '../data/reports-api';
import { Settings } from '../data/settings';
import { Substance } from '../data/substance';
import { SettingsApi } from '../data/settings-api';
import { Surface, ViewItem } from '../data/view-item';
import { ViewsApi } from '../data/views-api';
import { MetricsPage } from './metrics-page';

@Component({ template: '' })
class Blank {}

const settings: Settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };
const ALL = ['hour', 'day', 'week', 'month', 'year'] as MetricDefinition['scales'];

const catalog: MetricDefinition[] = [
  { key: 'substance.consumed', scope: 'substance', label: 'Consumed', unit: 'quantity', scales: [], period: true, description: 'How much.' },
  { key: 'substance.pace', scope: 'substance', label: 'Pace', unit: 'quantity', scales: ALL, period: true, description: 'Per interval.' },
  { key: 'substance.cost', scope: 'substance', label: 'Cost', unit: 'money', scales: [], period: true, description: 'What it cost.' },
  { key: 'batch.used', scope: 'batch', label: 'Used', unit: 'share', scales: [], period: false, description: 'Of a batch.' },
  { key: 'batch.valueConsumed', scope: 'batch', label: 'Value consumed', unit: 'money', scales: [], period: false, description: 'Money.' },
  { key: 'consumption.rankInDay', scope: 'consumption', label: 'Number that day', unit: 'rank', scales: [], period: false, description: '' },
];

const itemsOf = (surface: Surface, metrics: string[]): ViewItem[] =>
  metrics.map((metric, i) => ({ id: i + 1, surface, section: null, position: i + 1, metric, chart: null, scale: null, createdAt: '' }));

const table = (query: MetricsTableQuery): MetricsTable => ({
  scope: query.scope,
  per: query.per ?? 'day',
  from: null,
  to: null,
  keys: query.keys,
  rows:
    query.scope === 'consumption'
      ? [
          {
            type: 'consumption',
            id: 40,
            substanceId: 4,
            substanceName: 'Birra',
            unit: 'bottiglia',
            batchId: 7,
            batchName: 'Corona',
            name: null,
            occurredAt: '2026-09-25T20:00:00Z',
            quantity: '1.000',
            values: { 'consumption.rankInDay': '1' },
          },
          {
            type: 'one_time',
            id: 9,
            substanceId: 4,
            substanceName: 'Birra',
            unit: 'bottiglia',
            batchId: null,
            batchName: null,
            name: 'bar',
            occurredAt: '2026-09-12T20:00:00Z',
            quantity: '1.000',
            values: { 'consumption.rankInDay': '2' },
          },
        ]
      : query.scope === 'batch'
      ? [
          {
            id: 7,
            substanceId: 4,
            substanceName: 'Birra',
            unit: 'bottiglia',
            name: 'Corona',
            occurredAt: '2026-09-15T10:00:00Z',
            deactivatedAt: null,
            values: { 'batch.used': '0.3333', 'batch.valueConsumed': '3.00' },
          },
          {
            id: 2,
            substanceId: 1,
            substanceName: 'Caffè',
            unit: 'capsula',
            name: null,
            occurredAt: '2026-07-01T08:00:00Z',
            deactivatedAt: null,
            values: { 'batch.used': '0.9900', 'batch.valueConsumed': '34.65' },
          },
        ]
      : [
          { id: 4, name: 'Birra', unit: 'bottiglia', values: { 'substance.cost': '27.20', 'substance.pace': '0.345' } },
          { id: 1, name: 'Caffè', unit: 'capsula', values: { 'substance.cost': '3.10', 'substance.pace': null } },
          { id: 3, name: 'Erba', unit: 'g', values: { 'substance.cost': '40.00', 'substance.pace': '0.100' } },
        ],
});

describe('MetricsPage', () => {
  let harness: RouterTestingHarness | undefined;
  let asked: MetricsTableQuery[];
  let shownKeys: string[];
  let answer: (query: MetricsTableQuery) => Observable<MetricsTable>;
  let details: Array<[string, number]>;

  const element = () => harness!.routeNativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const texts = (selector: string) => Array.from(element().querySelectorAll(selector)).map(text);
  const column = (n: number) => texts(`tr.row td:nth-child(${n})`);

  /** Opens the page anew at `url` (from another page: the router would reuse it otherwise). */
  async function open(url: string): Promise<void> {
    harness ??= await RouterTestingHarness.create();
    await harness.navigateByUrl('/substances/0');
    await harness.navigateByUrl(url, MetricsPage);
    await harness.fixture.whenStable();
  }

  beforeEach(async () => {
    harness = undefined;
    asked = [];
    shownKeys = ['substance.cost', 'batch.used', 'substance.pace', 'batch.valueConsumed', 'consumption.rankInDay'];
    details = [];
    answer = (query) => of(table(query));
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'metrics', component: MetricsPage },
          { path: 'substances/:id', component: Blank },
          { path: 'substances/:id/batches/:batchId', component: Blank },
        ]),
        { provide: MetricsApi, useValue: { getCatalog: () => of(catalog), getTable: (q: MetricsTableQuery) => (asked.push(q), answer(q)) } },
        { provide: ViewsApi, useValue: { list: (surface: Surface) => of(itemsOf(surface, shownKeys)) } },
        { provide: SettingsApi, useValue: { getSettings: () => of(settings) } },
        {
          provide: ReportsApi,
          useValue: {
            listBatches: () =>
              of([{ id: 7, substanceId: 4, substanceName: 'Birra', name: 'Corona', occurredAt: '2026-09-15T10:00:00Z', deactivatedAt: null }]),
          },
        },
        {
          provide: ConsumptionActions,
          useValue: { details: async (row: { type: string; id: number }) => void details.push([row.type, row.id]) },
        },
        {
          provide: CatalogApi,
          useValue: {
            listSubstances: () =>
              of([
                { id: 4, name: 'Birra' },
                { id: 1, name: 'Caffè' },
              ] as Substance[]),
          },
        },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
  });

  it('one row per substance, one column per substance metric the page lists, in its order', async () => {
    await open('/metrics');

    expect(asked).toEqual([{ scope: 'substance', keys: ['substance.cost', 'substance.pace'], per: 'day', days: 30 }]);
    expect(texts('th')).toEqual(['Substance', 'Cost', 'Pace']);
    expect(column(1)).toEqual(['Birra', 'Caffè', 'Erba']);
    expect(column(2)).toEqual(['€27.20', '€3.10', '€40.00']);
    expect(column(3)).toEqual(['0.345 bottiglia / day', '—', '0.1 g / day']);
  });

  it('the period and the scale come from the URL, and go into it', async () => {
    await open('/metrics?days=0&per=week');

    expect(asked.at(-1)).toEqual({ scope: 'substance', keys: ['substance.cost', 'substance.pace'], per: 'week' });
    expect(text(element().querySelector('.period mat-select'))).toBe('All time');
    expect(text(element().querySelector('.per mat-select'))).toBe('week');

    element().querySelector<HTMLElement>('.period mat-select')!.click();
    await harness!.fixture.whenStable();
    Array.from(document.querySelectorAll<HTMLElement>('mat-option'))
      .find((o) => text(o) === 'Last 7 days')!
      .click();
    await harness!.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/metrics?days=7&per=week');
    expect(asked.at(-1)).toEqual({ scope: 'substance', keys: ['substance.cost', 'substance.pace'], per: 'week', days: 7 });
  });

  it('a header orders the rows by its column, the ones with no value last, and the URL keeps it', async () => {
    await open('/metrics');
    const header = (label: string) =>
      Array.from(element().querySelectorAll<HTMLElement>('th')).find((th) => text(th) === label)!.querySelector<HTMLElement>('.mat-sort-header-container')!;

    header('Pace').click();
    await harness!.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/metrics?sort=substance.pace&dir=asc');
    expect(column(1)).toEqual(['Erba', 'Birra', 'Caffè']);

    header('Pace').click();
    await harness!.fixture.whenStable();
    expect(column(1)).toEqual(['Birra', 'Erba', 'Caffè']);

    await open('/metrics?sort=name&dir=desc');
    expect(column(1)).toEqual(['Erba', 'Caffè', 'Birra']);
  });

  it("a row opens its substance's page", async () => {
    await open('/metrics');
    element().querySelectorAll<HTMLElement>('tr.row')[1]!.click();
    await harness!.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/substances/1');
  });

  it('the Batches tab: each batch with its substance and the day it was bought, the period always offered', async () => {
    await open('/metrics?table=batch');

    expect(asked.at(-1)).toEqual({ scope: 'batch', keys: ['batch.used', 'batch.valueConsumed'], per: 'day', days: 30 });
    expect(texts('a[mat-tab-link]')).toEqual(['Substances', 'Batches', 'Consumptions']);
    expect(element().querySelector('a[mat-tab-link].mdc-tab--active')?.textContent?.trim()).toBe('Batches');
    expect(texts('th')).toEqual(['Batch', 'Used', 'Value consumed']);
    expect(column(1)).toEqual(['Corona Birra · 15 Sept 2026', 'Unnamed batch Caffè · 1 Jul 2026']);
    expect(column(2)).toEqual(['33.3%', '99%']);
    expect(element().querySelector('.period')).not.toBeNull(); // it picks the batches bought in it
    expect(element().querySelector('.per')).toBeNull(); // no batch column reads in a scale
  });

  it('the batches of one substance: the URL keeps it', async () => {
    await open('/metrics?table=batch');
    element().querySelector<HTMLElement>('.substance-filter mat-select')!.click();
    await harness!.fixture.whenStable();
    Array.from(document.querySelectorAll<HTMLElement>('mat-option'))
      .find((o) => text(o) === 'Birra')!
      .click();
    await harness!.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/metrics?table=batch&substanceId=4');
    expect(asked.at(-1)).toEqual({ scope: 'batch', keys: ['batch.used', 'batch.valueConsumed'], per: 'day', days: 30, substanceId: 4 });
  });

  it("a batch's row opens its page, over its substance's", async () => {
    await open('/metrics?table=batch');
    element().querySelector<HTMLElement>('tr.row')!.click();
    await harness!.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/substances/4/batches/7');
  });

  it('a tab opens in the order of the API, keeping the period and the scale', async () => {
    await open('/metrics?per=week&sort=substance.pace&dir=desc');
    Array.from(element().querySelectorAll<HTMLElement>('a[mat-tab-link]'))
      .find((a) => text(a) === 'Batches')!
      .click();
    await harness!.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/metrics?per=week&table=batch');
  });

  it('the Consumptions tab: each consumption with its substance, when, where from and how much; a row opens its details', async () => {
    await open('/metrics?table=consumption');

    expect(asked.at(-1)).toEqual({ scope: 'consumption', keys: ['consumption.rankInDay'], per: 'day', days: 30 });
    expect(texts('th')).toEqual(['Consumption', 'Number that day']);
    expect(column(1)).toEqual([
      'Birra 25 Sept 2026, 22:00 Corona · 1 bottiglia',
      'Birra 12 Sept 2026, 22:00 One-time · bar · 1 bottiglia',
    ]);
    expect(column(2)).toEqual(['1st', '2nd']);
    expect(element().querySelector('.batch-filter')).toBeNull(); // a batch is chosen within a substance

    element().querySelectorAll<HTMLElement>('tr.row')[1]!.click();
    await harness!.fixture.whenStable();
    expect(details).toEqual([['one_time', 9]]);
    expect(TestBed.inject(Router).url).toBe('/metrics?table=consumption');
  });

  it('the consumptions of one batch of the substance chosen', async () => {
    await open('/metrics?table=consumption&substanceId=4');
    element().querySelector<HTMLElement>('.batch-filter mat-select')!.click();
    await harness!.fixture.whenStable();
    const options = Array.from(document.querySelectorAll<HTMLElement>('mat-option'));
    expect(options.map(text)).toEqual(['Every batch and one-time', 'Corona · 15 Sept 2026']);
    options[1]!.click();
    await harness!.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/metrics?table=consumption&substanceId=4&batchId=7');
    expect(asked.at(-1)).toMatchObject({ scope: 'consumption', substanceId: 4, batchId: 7 });
  });

  it('says when the page lists no substance metric, and when the table cannot be loaded', async () => {
    shownKeys = ['batch.used'];
    await open('/metrics');
    expect(asked).toEqual([]);
    expect(text(element().querySelector('.message'))).toBe('No metric is chosen for this table.');

    shownKeys = ['substance.cost'];
    answer = () => throwError(() => ({ status: 500 }));
    await open('/metrics');
    expect(text(element().querySelector('.message'))).toBe('Could not load the metrics (500)');
  });
});
