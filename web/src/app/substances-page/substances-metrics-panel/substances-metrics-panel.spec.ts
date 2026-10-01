import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of } from 'rxjs';

import { MetricDefinition, MetricsTable, MetricsTableQuery } from '../../data/metric';
import { MetricsApi } from '../../data/metrics-api';
import { Settings } from '../../data/settings';
import { Surface, ViewItem } from '../../data/view-item';
import { ViewsApi } from '../../data/views-api';
import { SubstancesMetricsPanel } from './substances-metrics-panel';

const settings: Settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };

const metric = (key: string, label: string): MetricDefinition =>
  ({ key, scope: key.split('.')[0], label, unit: 'quantity', scales: ['day', 'week'], period: true, description: '' }) as MetricDefinition;

const catalog = [metric('substance.consumed', 'Consumed'), metric('batch.used', 'Used'), metric('substance.pace', 'Pace')];

const item = (id: number, key: string): ViewItem => ({
  id,
  surface: 'metrics',
  section: null,
  position: id,
  metric: key,
  chart: null,
  scale: null,
  createdAt: '',
});

const table: MetricsTable = {
  scope: 'substance',
  per: 'day',
  from: null,
  to: null,
  keys: ['substance.pace', 'substance.consumed'],
  rows: [
    { id: 4, name: 'Birra', unit: 'bottle', values: { 'substance.pace': '1', 'substance.consumed': '30' } },
    { id: 3, name: 'Erba', unit: 'g', values: { 'substance.pace': '2', 'substance.consumed': '5' } },
  ],
};

describe('SubstancesMetricsPanel', () => {
  let fixture: ComponentFixture<SubstancesMetricsPanel>;
  let asked: unknown[];
  let opened: number[];
  let answer: (query: MetricsTableQuery) => Observable<MetricsTable>;

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const names = () => Array.from(element().querySelectorAll('tr.row .name-text')).map(text);

  async function render(inputs: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(SubstancesMetricsPanel);
    fixture.componentRef.setInput('settings', settings);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    opened = [];
    fixture.componentInstance.opened.subscribe((id) => opened.push(id));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    asked = [];
    answer = () => of(table);
    await TestBed.configureTestingModule({
      imports: [SubstancesMetricsPanel],
      providers: [
        provideRouter([]),
        {
          provide: MetricsApi,
          useValue: {
            getCatalog: () => (asked.push('catalog'), of(catalog)),
            getTable: (query: MetricsTableQuery) => (asked.push(query), answer(query)),
          },
        },
        {
          provide: ViewsApi,
          useValue: {
            list: (surface: Surface) => (
              asked.push(surface), of([item(1, 'substance.pace'), item(2, 'batch.used'), item(3, 'substance.consumed')])
            ),
          },
        },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
  });

  it('closed, says its period and scale and asks for nothing', async () => {
    await render();

    expect(text(element().querySelector('mat-panel-title'))).toBe('Metrics');
    expect(text(element().querySelector('.summary'))).toBe('Last 30 days · per day');
    expect(asked).toEqual([]);
  });

  it('open, a row per substance, the columns of the metrics page’s substances table, in its order', async () => {
    await render({ open: true });

    expect(asked).toEqual([
      'catalog',
      'metrics',
      { scope: 'substance', keys: ['substance.pace', 'substance.consumed'], per: 'day', days: 30 },
    ]);
    expect(Array.from(element().querySelectorAll('th')).map(text)).toEqual(['Substance', 'Pace', 'Consumed']);
    expect(names()).toEqual(['Birra', 'Erba']);
    expect(element().querySelector('a.choose')?.getAttribute('href')).toBe('/statistics/edit?section=metrics-substance');
  });

  it('a header orders the rows; a row opens its substance', async () => {
    await render({ open: true });
    (element().querySelectorAll('th')[2].querySelector('.mat-sort-header-container') as HTMLElement).click();
    await fixture.whenStable();
    expect(names()).toEqual(['Erba', 'Birra']);

    (element().querySelectorAll('tr.row')[1] as HTMLElement).click();
    expect(opened).toEqual([4]);
  });

  it('another scale keeps the table in place while it loads: nothing shrinks or is built again', async () => {
    await render({ open: true });
    const before = element().querySelector('app-metrics-table');
    const week = new Subject<MetricsTable>();
    answer = (query) => (query.per === 'week' ? week : of(table));

    // Not whenStable(): the answer is held back, and a pending resource never lets the page be stable.
    element().querySelector<HTMLElement>('.per mat-select')!.click();
    fixture.detectChanges();
    Array.from(document.querySelectorAll<HTMLElement>('mat-option'))
      .find((o) => text(o) === 'week')!
      .click();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    expect(element().querySelector('app-metrics-table')).toBe(before);
    expect(names()).toEqual(['Birra', 'Erba']);

    week.next({ ...table, per: 'week' });
    week.complete();
    await fixture.whenStable();
    expect(element().querySelector('app-metrics-table')).toBe(before);
  });
});
