import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of, throwError } from 'rxjs';

import { MetricDefinition, MetricScope } from '../data/metric';
import { MetricsApi } from '../data/metrics-api';
import { SeriesDefinition } from '../data/series';
import { Chart, ChartChange, NewViewItem, Surface, ViewItem } from '../data/view-item';
import { ViewsApi } from '../data/views-api';
import { StatisticsEditPage } from './statistics-edit-page';

const metric = (key: string, label: string): MetricDefinition => ({
  key,
  scope: key.split('.')[0] as MetricScope,
  label,
  unit: 'quantity',
  scales: [],
  period: false,
  description: `${label}.`,
});

const series = (key: string, label: string): SeriesDefinition => ({
  key,
  scope: 'series',
  label,
  unit: 'money',
  scales: ['day', 'week', 'month', 'year'],
  period: true,
  charts: ['bar', 'line'],
  description: `${label} over time.`,
});

const catalog = [
  metric('substance.consumed', 'Consumed'),
  metric('substance.pace', 'Pace'),
  metric('batch.used', 'Used'),
  metric('batch.pace', 'Batch pace'),
  metric('consumption.rankInDay', 'Number that day'),
  series('series.cost', 'Cost'),
  series('series.spend', 'Spend'),
];

/** An item as the fake API keeps it: id and key, and for a chart how it is drawn and where. */
type Stored = [number, string] | [number, string, Chart, string | null, string | null];

describe('StatisticsEditPage', () => {
  let harness: RouterTestingHarness;
  /** What the API holds, by surface, in order. */
  let stored: Record<string, Stored[]>;
  let writes: unknown[];
  let failWrites: boolean;
  let snacks: string[];

  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const card = (id: string) => document.getElementById(id)!;
  const labels = (id: string) => Array.from(card(id).querySelectorAll('.item .label')).map(text);

  const listOf = (surface: Surface): ViewItem[] =>
    (stored[surface] ?? []).map(([id, key, chart, scale, section], i) => ({
      id,
      surface,
      section: section ?? null,
      position: i + 1,
      metric: key,
      chart: chart ?? null,
      scale: scale ?? null,
      createdAt: '',
    }));

  function write<T>(record: unknown, apply: () => T): Observable<T> {
    writes.push(record);
    if (failWrites) return throwError(() => ({ status: 409, title: 'Conflict', detail: 'already there' }));
    return of(apply());
  }

  async function open(url = '/statistics/edit'): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, StatisticsEditPage);
    await harness.fixture.whenStable();
  }

  beforeEach(async () => {
    stored = {
      statistics: [
        [20, 'series.cost', 'bar', 'month', 'Money'],
        [21, 'series.spend', 'line', 'week', 'Money'],
      ],
      // the substance page: the metrics of its panel and its charts share one order
      substance: [
        [1, 'substance.pace'],
        [22, 'series.cost', 'bar', 'week', null],
        [23, 'series.spend', 'bar', 'week', null],
      ],
      batch: [[2, 'batch.used']],
      consumption: [],
      // the metrics page: its three tables share one order
      metrics: [
        [10, 'substance.consumed'],
        [11, 'batch.used'],
        [12, 'substance.pace'],
        [13, 'batch.pace'],
      ],
    };
    writes = [];
    failWrites = false;
    snacks = [];
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'statistics/edit', component: StatisticsEditPage }]),
        { provide: MetricsApi, useValue: { getCatalog: () => of(catalog) } },
        {
          provide: ViewsApi,
          useValue: {
            list: (surface: Surface) => of(listOf(surface)),
            add: (item: NewViewItem) =>
              write(item.chart ? ['add', item] : ['add', item.surface, item.metric], () =>
                stored[item.surface]!.push(item.chart ? [99, item.metric, item.chart, item.scale ?? null, item.section ?? null] : [99, item.metric]),
              ),
            change: (id: number, change: ChartChange) => write(['change', id, change], () => ({})),
            renameSection: (from: string | null, to: string | null) => write(['rename', from, to], () => []),
            remove: (id: number) =>
              write(['remove', id], () => {
                for (const s of Object.keys(stored)) stored[s] = stored[s]!.filter(([i]) => i !== id);
              }),
            reorder: (surface: Surface, ids: number[]) =>
              write(['reorder', surface, ids], () => {
                const byId = new Map(stored[surface]!.map((entry) => [entry[0], entry]));
                stored[surface] = ids.map((id) => byId.get(id)!);
                return listOf(surface);
              }),
          },
        },
        { provide: MatSnackBar, useValue: { open: (message: string) => snacks.push(message) } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
  });

  it('one card per place that shows metrics or charts, each with what it shows', async () => {
    await open();

    expect(Array.from(document.querySelectorAll('mat-card-title')).map(text)).toEqual([
      'Statistics page',
      'Substance page: metrics',
      'Substance page: charts',
      'Batch page',
      'Consumption details',
      'Metrics page: substances',
      'Metrics page: batches',
      'Metrics page: consumptions',
    ]);
    expect(labels('statistics')).toEqual(['Cost', 'Spend']);
    expect(labels('substance')).toEqual(['Pace']); // the charts of the substance page have their own card
    expect(labels('substance-charts')).toEqual(['Cost', 'Spend']);
    expect(labels('consumption')).toEqual([]);
    expect(labels('metrics-substance')).toEqual(['Consumed', 'Pace']);
    expect(labels('metrics-batch')).toEqual(['Used', 'Batch pace']);
  });

  it('adds and removes at once, then shows the list the API has', async () => {
    await open();
    card('batch').querySelector<HTMLElement>('.add mat-select')!.click();
    await harness.fixture.whenStable();
    Array.from(document.querySelectorAll<HTMLElement>('mat-option'))
      .find((o) => text(o).startsWith('Batch pace'))!
      .click();
    await harness.fixture.whenStable();
    expect(labels('batch')).toEqual(['Used', 'Batch pace']);

    card('substance').querySelector<HTMLButtonElement>('.remove')!.click();
    await harness.fixture.whenStable();
    expect(labels('substance')).toEqual([]);
    expect(writes).toEqual([
      ['add', 'batch', 'batch.pace'],
      ['remove', 1],
    ]);
  });

  it("moves a column within its table of the metrics page, the other tables' keeping their places", async () => {
    await open();
    card('metrics-substance').querySelector<HTMLButtonElement>('.down')!.click();
    await harness.fixture.whenStable();

    expect(writes).toEqual([['reorder', 'metrics', [12, 11, 10, 13]]]);
    expect(labels('metrics-substance')).toEqual(['Pace', 'Consumed']);
    expect(labels('metrics-batch')).toEqual(['Used', 'Batch pace']);
  });

  it('the charts: added, changed, moved (the metrics of the substance page keeping their places) and their sections renamed', async () => {
    await open();
    card('substance-charts').querySelector<HTMLElement>('.add mat-select')!.click();
    await harness.fixture.whenStable();
    Array.from(document.querySelectorAll<HTMLElement>('mat-option'))
      .find((o) => text(o).startsWith('Cost'))!
      .click();
    await harness.fixture.whenStable();
    expect(labels('substance-charts')).toEqual(['Cost', 'Spend', 'Cost']);

    card('substance-charts').querySelectorAll<HTMLButtonElement>('.item .up')[1]!.click();
    await harness.fixture.whenStable();

    card('statistics').querySelector<HTMLElement>('.type mat-select')!.click();
    await harness.fixture.whenStable();
    Array.from(document.querySelectorAll<HTMLElement>('mat-option'))
      .find((o) => text(o) === 'Lines')!
      .click();
    await harness.fixture.whenStable();

    const name = card('statistics').querySelector<HTMLInputElement>('.section-name input')!;
    name.value = 'Spending';
    name.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();

    expect(writes).toEqual([
      ['add', { surface: 'substance', metric: 'series.cost', chart: 'bar', scale: 'week', section: null }],
      ['reorder', 'substance', [1, 23, 22, 99]],
      ['change', 20, { chart: 'line' }],
      ['rename', 'Money', 'Spending'],
    ]);
  });

  it('opens at the place asked (?section=), the charts of the substance page too', async () => {
    const scrolled: string[] = [];
    const scrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id);
    };
    try {
      await open('/statistics/edit?section=substance-charts');
      // the page scrolls once its cards are there: wait for it, not for a fixed time
      for (let tries = 0; tries < 40 && scrolled.length === 0; tries++) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        await harness.fixture.whenStable();
      }
    } finally {
      Element.prototype.scrollIntoView = scrollIntoView;
    }
    expect(scrolled).toEqual(['substance-charts']);
  });

  it('says why a change was not saved, and shows what the API has', async () => {
    failWrites = true;
    await open();
    card('substance').querySelector<HTMLButtonElement>('.remove')!.click();
    await harness.fixture.whenStable();

    expect(snacks).toEqual(['Not saved: already there']);
    expect(labels('substance')).toEqual(['Pace']);
  });
});
