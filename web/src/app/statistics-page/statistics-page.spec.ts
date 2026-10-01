import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { MetricDefinition } from '../data/metric';
import { MetricsApi } from '../data/metrics-api';
import { SeriesDefinition } from '../data/series';
import { SettingsApi } from '../data/settings-api';
import { Surface, ViewItem } from '../data/view-item';
import { ViewsApi } from '../data/views-api';
import { Widget } from '../ui/widget/widget';
import { StatisticsPage } from './statistics-page';

/** Stands in for a widget: which chart, in which period, is what matters here. */
@Component({ selector: 'app-widget', template: '' })
class WidgetStub {
  readonly item = input<ViewItem>();
  readonly definition = input<SeriesDefinition>();
  readonly days = input<number>();
  readonly currency = input<string>();
}

const definition = (key: string, label: string): SeriesDefinition => ({
  key,
  scope: 'series',
  label,
  unit: 'money',
  scales: ['week', 'month'] as SeriesDefinition['scales'],
  period: true,
  charts: ['bar'],
  description: '',
});

const catalog: (MetricDefinition | SeriesDefinition)[] = [
  { key: 'substance.pace', scope: 'substance', label: 'Pace', unit: 'quantity', scales: [], period: true, description: '' },
  definition('series.cost', 'Cost'),
  definition('series.spend', 'Spend'),
  definition('series.consumed', 'Consumed'),
];

const chart = (id: number, metric: string, section: string | null): ViewItem => ({
  id,
  surface: 'statistics',
  section,
  position: id,
  metric,
  chart: 'bar',
  scale: 'month',
  createdAt: '',
});

describe('StatisticsPage', () => {
  let harness: RouterTestingHarness;
  let charts: ViewItem[];

  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const element = () => harness.routeNativeElement as HTMLElement;
  const widgets = () =>
    harness.fixture.debugElement
      .queryAll((d) => d.componentInstance instanceof WidgetStub)
      .map((d) => d.componentInstance as WidgetStub);

  async function open(url: string): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, StatisticsPage);
    await harness.fixture.whenStable();
  }

  beforeEach(async () => {
    charts = [chart(1, 'series.consumed', 'Consumption'), chart(2, 'series.cost', 'Money'), chart(3, 'series.gone', 'Money'), chart(4, 'series.spend', 'Money'), chart(5, 'series.cost', null)];
    TestBed.overrideComponent(StatisticsPage, { remove: { imports: [Widget] }, add: { imports: [WidgetStub] } });
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'statistics', component: StatisticsPage },
          { path: 'metrics', component: StatisticsPage },
        ]),
        { provide: MetricsApi, useValue: { getCatalog: () => of(catalog) } },
        { provide: ViewsApi, useValue: { list: (surface: Surface) => of(surface === 'statistics' ? charts : []) } },
        { provide: SettingsApi, useValue: { getSettings: () => of({ timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'CHF' }) } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
  });

  it('the charts in their sections, in order, in the period of the page', async () => {
    await open('/statistics');

    expect(Array.from(element().querySelectorAll('.section-name')).map(text)).toEqual(['Consumption', 'Money']);
    expect(widgets().map((w) => [w.item()?.id, w.definition()?.label, w.days(), w.currency()])).toEqual([
      [1, 'Consumed', 90, 'CHF'],
      [2, 'Cost', 90, 'CHF'],
      [4, 'Spend', 90, 'CHF'], // a chart of a series the catalog no longer has is left out
      [5, 'Cost', 90, 'CHF'], // the charts without a section, together
    ]);
    expect(text(element().querySelector('.intro'))).toBe('Charts over time. To compare the entities today, see Metrics.');
  });

  it('the period is in the URL', async () => {
    await open('/statistics?days=365');
    expect(widgets().every((w) => w.days() === 365)).toBe(true);

    element().querySelector<HTMLElement>('.period mat-select')!.click();
    await harness.fixture.whenStable();
    Array.from(document.querySelectorAll<HTMLElement>('mat-option'))
      .find((o) => text(o) === 'All time')!
      .click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/statistics?days=0');
    expect(widgets().every((w) => w.days() === 0)).toBe(true);
  });

  it('says when no chart is chosen, with the way to choose them', async () => {
    charts = [];
    await open('/statistics');

    expect(text(element().querySelector('.message'))).toBe('No chart is chosen: choose them.');
    expect(element().querySelector('.message a')?.getAttribute('href')).toBe('/statistics/edit?section=statistics');
  });
});
