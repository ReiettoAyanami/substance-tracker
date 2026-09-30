import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of, throwError } from 'rxjs';

import { MetricDefinition, MetricsTable, MetricsTableQuery } from '../data/metric';
import { MetricsApi } from '../data/metrics-api';
import { Settings } from '../data/settings';
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
];

const itemsOf = (surface: Surface, metrics: string[]): ViewItem[] =>
  metrics.map((metric, i) => ({ id: i + 1, surface, section: null, position: i + 1, metric, chart: null, scale: null, createdAt: '' }));

const table = (query: MetricsTableQuery): MetricsTable => ({
  scope: 'substance',
  per: query.per ?? 'day',
  from: null,
  to: null,
  keys: query.keys,
  rows: [
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
    shownKeys = ['substance.cost', 'batch.used', 'substance.pace'];
    answer = (query) => of(table(query));
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'metrics', component: MetricsPage },
          { path: 'substances/:id', component: Blank },
        ]),
        { provide: MetricsApi, useValue: { getCatalog: () => of(catalog), getTable: (q: MetricsTableQuery) => (asked.push(q), answer(q)) } },
        { provide: ViewsApi, useValue: { list: (surface: Surface) => of(itemsOf(surface, shownKeys)) } },
        { provide: SettingsApi, useValue: { getSettings: () => of(settings) } },
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
