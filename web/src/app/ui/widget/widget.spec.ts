import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Observable, of, throwError } from 'rxjs';

import { MetricsApi } from '../../data/metrics-api';
import { SeriesData, SeriesDefinition, SeriesQuery } from '../../data/series';
import { Settings } from '../../data/settings';
import { ViewItem } from '../../data/view-item';
import { Chart } from '../chart/chart';
import { Widget } from './widget';

/** Stands in for the chart: what it is given is what matters here. */
@Component({ selector: 'app-chart', template: '' })
class ChartStub {
  readonly data = input<SeriesData>();
  readonly type = input<string>();
  readonly unit = input<string>();
  readonly settings = input<Settings>();
}

const cost: SeriesDefinition = {
  key: 'series.cost',
  scope: 'series',
  label: 'Cost',
  unit: 'money',
  scales: ['day', 'week', 'month', 'year'],
  period: true,
  charts: ['bar', 'line', 'donut'],
  description: 'What it cost.',
};

const item = (changes: Partial<ViewItem> = {}): ViewItem => ({
  id: 3,
  surface: 'statistics',
  section: 'Money',
  position: 1,
  metric: 'series.cost',
  chart: 'bar',
  scale: 'month',
  createdAt: '',
  ...changes,
});

const data: SeriesData = { metric: 'series.cost', per: 'month', by: 'substance', from: '2026-07-01', to: '2026-09-29', periods: [], series: [] };

describe('Widget', () => {
  let fixture: ComponentFixture<Widget>;
  let asked: SeriesQuery[];
  let answer: () => Observable<SeriesData>;

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const chart = () => fixture.debugElement.query((d) => d.componentInstance instanceof ChartStub)?.componentInstance as ChartStub | undefined;

  async function render(inputs: Record<string, unknown>): Promise<void> {
    fixture = TestBed.createComponent(Widget);
    fixture.componentRef.setInput('item', item());
    fixture.componentRef.setInput('definition', cost);
    fixture.componentRef.setInput('settings', { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' });
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    asked = [];
    answer = () => of(data);
    TestBed.overrideComponent(Widget, { remove: { imports: [Chart] }, add: { imports: [ChartStub] } });
    await TestBed.configureTestingModule({
      imports: [Widget],
      providers: [
        { provide: MetricsApi, useValue: { getSeries: (q: SeriesQuery) => (asked.push(q), answer()) } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
  });

  it('asks for its series in the period of its page, and gives it to the chart', async () => {
    await render({ days: 90, settings: { timezone: 'Europe/London', dayStartsAt: '04:00:00', currency: 'GBP' } });

    expect(asked).toEqual([{ metric: 'series.cost', per: 'month', days: 90 }]);
    expect(text(element().querySelector('mat-card-title'))).toBe('Cost');
    expect(text(element().querySelector('mat-card-subtitle'))).toBe('per month');
    expect(chart()?.data()).toBe(data);
    expect([chart()?.type(), chart()?.unit(), chart()?.settings()?.currency]).toEqual(['bar', 'money', 'GBP']);
  });

  it('a donut is the share of the period; all time and one substance by batch are asked as such', async () => {
    await render({ item: item({ chart: 'donut' }), days: 0, substanceIds: [4], by: 'batch' });

    expect(text(element().querySelector('mat-card-subtitle'))).toBe('share of the period');
    expect(asked).toEqual([{ metric: 'series.cost', per: 'month', substanceIds: [4], by: 'batch' }]);
  });

  it('asks again when its page says something changed (refresh)', async () => {
    await render({ days: 30 });
    fixture.componentRef.setInput('refresh', { id: 4 });
    await fixture.whenStable();

    expect(asked).toEqual([
      { metric: 'series.cost', per: 'month', days: 30 },
      { metric: 'series.cost', per: 'month', days: 30 },
    ]);
  });

  it('the hour of the day has no interval', async () => {
    await render({ item: item({ metric: 'series.hourOfDay', scale: null }) });

    expect(asked).toEqual([{ metric: 'series.hourOfDay' }]);
    expect(element().querySelector('mat-card-subtitle')).toBeNull();
  });

  it('says when its chart cannot be loaded', async () => {
    answer = () => throwError(() => ({ status: 500 }));
    await render({});

    expect(text(element().querySelector('.message'))).toBe('Could not load the chart (500)');
  });
});
