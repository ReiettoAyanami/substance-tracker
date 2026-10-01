import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { MetricDefinition, MetricsQuery, MetricsResult } from '../../data/metric';
import { MetricsApi } from '../../data/metrics-api';
import { Settings } from '../../data/settings';
import { Surface, ViewItem } from '../../data/view-item';
import { ViewsApi } from '../../data/views-api';
import { MetricsPanel } from './metrics-panel';

const settings: Settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };
const ALL = ['hour', 'day', 'week', 'month', 'year'] as MetricDefinition['scales'];

const catalog: MetricDefinition[] = [
  { key: 'substance.consumed', scope: 'substance', label: 'Consumed', unit: 'quantity', scales: [], period: true, description: 'How much.' },
  { key: 'substance.pace', scope: 'substance', label: 'Pace', unit: 'quantity', scales: ALL, period: true, description: 'Per interval.' },
  { key: 'substance.sinceLast', scope: 'substance', label: 'Since the last one', unit: 'duration', scales: ALL, period: false, description: 'To now.' },
  { key: 'batch.used', scope: 'batch', label: 'Used', unit: 'share', scales: [], period: false, description: 'Of a batch.' },
];

const result = (query: MetricsQuery): MetricsResult => ({
  per: query.per ?? 'day',
  from: null,
  to: null,
  values: {
    'substance.consumed': '9.000',
    'substance.pace': query.per === 'week' ? '2.250' : '0.321',
    'substance.sinceLast': null,
  },
});

/** What a surface shows, as the API gives it: here, in an order that is not the catalog's. */
const itemsOf = (surface: Surface, metrics: string[]): ViewItem[] =>
  metrics.map((metric, i) => ({
    id: i + 1,
    surface,
    section: null,
    position: i + 1,
    metric,
    chart: null,
    scale: null,
    createdAt: '2026-09-29T10:00:00Z',
  }));

describe('MetricsPanel', () => {
  let fixture: ComponentFixture<MetricsPanel>;
  let shownKeys: string[];
  let surfaces: Surface[];
  let asked: Array<{ id: number; query: MetricsQuery }>;
  let catalogs: number;
  let answer: (query: MetricsQuery) => Observable<MetricsResult>;

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const texts = (selector: string) => Array.from(element().querySelectorAll(selector)).map(text);

  async function render(inputs: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(MetricsPanel);
    fixture.componentRef.setInput('scope', 'substance');
    fixture.componentRef.setInput('entityId', 4);
    fixture.componentRef.setInput('unit', 'beer');
    fixture.componentRef.setInput('settings', settings);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
  }

  async function expand(): Promise<void> {
    element().querySelector<HTMLElement>('mat-expansion-panel-header')!.click();
    await fixture.whenStable();
  }

  async function choose(field: string, option: string): Promise<void> {
    element().querySelector<HTMLElement>(`${field} mat-select`)!.click();
    await fixture.whenStable();
    const options = Array.from(document.querySelectorAll<HTMLElement>('mat-option'));
    options.find((o) => text(o) === option)!.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    asked = [];
    catalogs = 0;
    surfaces = [];
    shownKeys = ['substance.consumed', 'substance.pace', 'substance.sinceLast'];
    answer = (query) => of(result(query));
    await TestBed.configureTestingModule({
      imports: [MetricsPanel],
      providers: [
        provideRouter([]),
        {
          provide: MetricsApi,
          useValue: {
            getCatalog: () => {
              catalogs++;
              return of(catalog);
            },
            getSubstanceMetrics: (id: number, query: MetricsQuery) => {
              asked.push({ id, query });
              return answer(query);
            },
          },
        },
        {
          provide: ViewsApi,
          useValue: {
            list: (surface: Surface) => {
              surfaces.push(surface);
              return of(itemsOf(surface, shownKeys));
            },
          },
        },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
  });

  it('closed, says the period and the scale, and asks for nothing', async () => {
    await render();

    expect(text(element().querySelector('mat-panel-title'))).toBe('Metrics');
    expect(text(element().querySelector('.summary'))).toBe('Last 30 days · per day');
    expect(asked).toEqual([]);
    expect(catalogs).toBe(0);
    // closed, it will not grow: a window holding it need not wait
    expect(element().classList).toContain('ready');
  });

  it('opened, shows the metrics its page lists, the value first and what it is under it', async () => {
    await render();
    await expand();

    expect(surfaces).toEqual(['substance']);
    expect(asked).toEqual([{ id: 4, query: { per: 'day', days: 30 } }]);
    expect(texts('.metric .value')).toEqual(['9 beer', '0.321 beer / day', '—']);
    expect(texts('.metric .label')).toEqual(['Consumed', 'Pace', 'Since the last one']);
    expect(element().querySelector('.description')).toBeNull();
  });

  it('in the order its page lists them, leaving out a key the catalog does not have', async () => {
    shownKeys = ['substance.sinceLast', 'substance.retired', 'substance.consumed'];
    await render({ open: true });

    expect(texts('.metric .label')).toEqual(['Since the last one', 'Consumed']);
    // its numbers are on screen: a window holding it shows (styles.css)
    expect(element().classList).toContain('ready');
  });

  it('says when its page shows no metric, and offers no scale or period', async () => {
    shownKeys = [];
    await render({ open: true });

    expect(text(element().querySelector('.message'))).toBe('No metric is chosen for this page: choose them.');
    expect(element().querySelector('.message a')?.getAttribute('href')).toBe('/statistics/edit?section=substance');
    expect(element().querySelector('.per')).toBeNull();
    expect(element().querySelector('.period')).toBeNull();
    expect(text(element().querySelector('.summary'))).toBe('');
    expect(element().classList).toContain('ready');
  });

  it('offers the period only when a metric shown follows one', async () => {
    shownKeys = ['substance.sinceLast'];
    await render({ open: true });

    expect(element().querySelector('.period')).toBeNull();
    expect(element().querySelector('.per')).not.toBeNull();
    expect(text(element().querySelector('.summary'))).toBe('per day');
  });

  it('a new scale or period asks again, and is remembered for the next panel', async () => {
    await render();
    await expand();

    await choose('.per', 'week');
    expect(asked.at(-1)).toEqual({ id: 4, query: { per: 'week', days: 30 } });
    expect(texts('.metric .value')[1]).toBe('2.25 beer / week');

    await choose('.period', 'All time');
    expect(asked.at(-1)).toEqual({ id: 4, query: { per: 'week' } });
    expect(text(element().querySelector('.summary'))).toBe('All time · per week');

    fixture.destroy();
    await render({ open: true });
    expect(asked.at(-1)).toEqual({ id: 4, query: { per: 'week' } });
  });

  it('keeps its numbers in place while another scale loads: nothing shrinks or opens again', async () => {
    await render({ open: true });
    const list = element().querySelector('dl.metrics');
    const week = new Subject<MetricsResult>();
    answer = (query) => (query.per === 'week' ? week : of(result(query)));

    // Not choose(): the answer is held back, and a pending resource never lets the page be stable.
    element().querySelector<HTMLElement>('.per mat-select')!.click();
    fixture.detectChanges();
    Array.from(document.querySelectorAll<HTMLElement>('mat-option'))
      .find((o) => text(o) === 'week')!
      .click();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    expect(element().querySelector('dl.metrics')).toBe(list);
    expect(texts('.metric .value')[1]).toBe('0.321 beer / day');

    week.next(result({ per: 'week' }));
    week.complete();
    await fixture.whenStable();
    expect(element().querySelector('dl.metrics')).toBe(list);
    expect(texts('.metric .value')[1]).toBe('2.25 beer / week');
  });

  it('starts open when asked to, and asks again when refresh changes', async () => {
    await render({ open: true, refresh: 1 });
    expect(asked.length).toBe(1);

    fixture.componentRef.setInput('refresh', 2);
    await fixture.whenStable();
    expect(asked.length).toBe(2);
  });

  it('the info button shows what each number is', async () => {
    await render({ open: true });
    element().querySelector<HTMLButtonElement>('.explain')!.click();
    await fixture.whenStable();

    expect(texts('.metric .description')).toEqual(['How much.', 'Per interval.', 'To now.']);
    expect(element().querySelector('.explain')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('says when the metrics cannot be loaded', async () => {
    answer = () => throwError(() => ({ status: 500 }));
    await render({ open: true });

    expect(text(element().querySelector('.message'))).toBe('Could not load the metrics (500)');
  });
});
