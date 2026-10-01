import { Component, input } from '@angular/core';
import { ComponentFixture, DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { MetricDefinition } from '../../data/metric';
import { MetricsApi } from '../../data/metrics-api';
import { SeriesDefinition } from '../../data/series';
import { Settings } from '../../data/settings';
import { Surface, ViewItem } from '../../data/view-item';
import { ViewsApi } from '../../data/views-api';
import { Widget } from '../widget/widget';
import { ChartsPanel } from './charts-panel';

/** Stands in for a widget: which chart, for whom, in which period, is what matters here. */
@Component({ selector: 'app-widget', template: '' })
class WidgetStub {
  readonly item = input<ViewItem>();
  readonly definition = input<SeriesDefinition>();
  readonly days = input<number>();
  readonly settings = input<Settings>();
  readonly substanceIds = input<number[]>();
  readonly by = input<string>();
  readonly refresh = input<unknown>();
}

const settings: Settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };

const consumed: SeriesDefinition = {
  key: 'series.consumed',
  scope: 'series',
  label: 'Consumed',
  unit: 'quantity',
  scales: ['day', 'week', 'month', 'year'],
  period: true,
  charts: ['bar', 'line'],
  description: 'How much.',
};

const catalog: (MetricDefinition | SeriesDefinition)[] = [
  { key: 'substance.pace', scope: 'substance', label: 'Pace', unit: 'quantity', scales: [], period: true, description: '' },
  consumed,
];

const item = (id: number, metric: string, chart: ViewItem['chart']): ViewItem => ({
  id,
  surface: 'substance',
  section: null,
  position: id,
  metric,
  chart,
  scale: chart ? 'week' : null,
  createdAt: '',
});

describe('ChartsPanel', () => {
  let fixture: ComponentFixture<ChartsPanel>;
  let items: ViewItem[];
  let asked: string[];
  let answer: () => Observable<ViewItem[]>;

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const widgets = () =>
    fixture.debugElement.queryAll((d) => d.componentInstance instanceof WidgetStub).map((d) => d.componentInstance as WidgetStub);

  async function render(inputs: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(ChartsPanel);
    fixture.componentRef.setInput('substanceId', 4);
    fixture.componentRef.setInput('settings', settings);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
  }

  async function expand(): Promise<void> {
    element().querySelector<HTMLElement>('mat-expansion-panel-header')!.click();
    await fixture.whenStable();
  }

  /** The charts are in a deferred block (their library comes with them): it is let through by hand. */
  async function draw(): Promise<void> {
    const blocks = await fixture.getDeferBlocks();
    expect(blocks.length).toBe(1);
    await blocks[0]!.render(DeferBlockState.Complete);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    asked = [];
    items = [item(1, 'substance.pace', null), item(2, 'series.consumed', 'bar'), item(3, 'series.gone', 'line'), item(4, 'series.consumed', 'line')];
    answer = () => of(items);
    TestBed.overrideComponent(ChartsPanel, { remove: { imports: [Widget] }, add: { imports: [WidgetStub] } });
    await TestBed.configureTestingModule({
      imports: [ChartsPanel],
      deferBlockBehavior: DeferBlockBehavior.Manual,
      providers: [
        provideRouter([]),
        { provide: MetricsApi, useValue: { getCatalog: () => (asked.push('catalog'), of(catalog)) } },
        { provide: ViewsApi, useValue: { list: (surface: Surface) => (asked.push(surface), answer()) } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
  });

  it('closed, says its period and asks for nothing', async () => {
    await render();

    expect(text(element().querySelector('mat-panel-title'))).toBe('Charts');
    expect(text(element().querySelector('.summary'))).toBe('Last 90 days');
    expect(asked).toEqual([]);
    expect(widgets()).toEqual([]);
  });

  it('opened, draws the charts the substance page lists, for its substance, a line per batch', async () => {
    await render({ refresh: 'v1' });
    await expand();
    expect(asked).toEqual(['catalog', 'substance']);
    expect(widgets()).toEqual([]); // not before the block is let through
    await draw();

    // the metrics of the panel are not charts; a series the catalog no longer has is left out
    expect(widgets().map((w) => [w.item()?.id, w.definition()?.label, w.days(), w.substanceIds(), w.by(), w.settings(), w.refresh()])).toEqual([
      [2, 'Consumed', 90, [4], 'batch', settings, 'v1'],
      [4, 'Consumed', 90, [4], 'batch', settings, 'v1'],
    ]);
  });

  it('without a substance, draws the charts the substances page lists, a line per substance (lenzi, 2026-10-01)', async () => {
    items = [{ ...item(7, 'series.consumed', 'bar'), surface: 'substances' }];
    await render({ substanceId: null, open: true });
    await draw();

    expect(asked).toEqual(['catalog', 'substances']);
    expect(widgets().map((w) => [w.item()?.id, w.substanceIds(), w.by()])).toEqual([[7, undefined, 'substance']]);
    expect(element().querySelector('a.choose')?.getAttribute('href')).toBe('/statistics/edit?section=substances-charts');
  });

  it('the period is the panel’s, remembered by this browser', async () => {
    await render({ open: true });
    await draw();
    element().querySelector<HTMLElement>('.period mat-select')!.click();
    await fixture.whenStable();
    Array.from(document.querySelectorAll<HTMLElement>('mat-option'))
      .find((o) => text(o) === 'Last 365 days')!
      .click();
    await fixture.whenStable();

    expect(widgets().map((w) => w.days())).toEqual([365, 365]);
    await render();
    expect(text(element().querySelector('.summary'))).toBe('Last 365 days');
  });

  it('says when no chart is chosen, and leads to where they are chosen', async () => {
    items = [item(1, 'substance.pace', null)];
    await render({ open: true });

    expect(text(element().querySelector('.message'))).toBe('No chart is chosen for this page: choose them.');
    expect(element().querySelector('.message a')?.getAttribute('href')).toBe('/statistics/edit?section=substance-charts');
    expect(element().querySelector('a.choose')?.getAttribute('href')).toBe('/statistics/edit?section=substance-charts');
  });

  it('says when the charts cannot be loaded', async () => {
    answer = () => throwError(() => ({ status: 503 }));
    await render({ open: true });

    expect(text(element().querySelector('.message'))).toBe('Could not load the charts (503)');
  });
});
