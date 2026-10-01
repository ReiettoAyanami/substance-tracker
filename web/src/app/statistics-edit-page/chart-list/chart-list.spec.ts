import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

import { ChartType, SeriesDefinition, SeriesScale } from '../../data/series';
import { ViewItem } from '../../data/view-item';
import { ChartList } from './chart-list';

const series = (key: string, label: string, charts: ChartType[], scales: SeriesScale[]): SeriesDefinition => ({
  key,
  scope: 'series',
  label,
  unit: 'money',
  scales,
  period: true,
  charts,
  description: `What ${label} is.`,
});

const catalog = [
  series('series.cost', 'Cost', ['bar', 'line', 'donut'], ['day', 'week', 'month', 'year']),
  series('series.unitPrice', 'Unit price', ['line', 'bar'], ['day', 'week', 'month', 'year']),
  series('series.hourOfDay', 'Hour of the day', ['bar', 'line'], []),
];

const chart = (id: number, metric: string, section: string | null, type: ChartType = 'bar', scale: string | null = 'month'): ViewItem => ({
  id,
  surface: 'statistics',
  section,
  position: id,
  metric,
  chart: type,
  scale,
  createdAt: '',
});

/** Money: cost, unit price; Habits: the hours; without a section: a series the catalog no longer has. */
const page = [
  chart(1, 'series.cost', 'Money'),
  chart(2, 'series.hourOfDay', 'Habits', 'bar', null),
  chart(3, 'series.unitPrice', 'Money', 'line'),
  chart(4, 'series.gone', null),
];

describe('ChartList', () => {
  let fixture: ComponentFixture<ChartList>;
  let events: unknown[];

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const texts = (selector: string) => Array.from(element().querySelectorAll(selector)).map(text);
  const all = <T extends Element>(selector: string) => Array.from(element().querySelectorAll<T>(selector));

  async function render(items: ViewItem[], options: { sections?: boolean; busy?: boolean } = {}): Promise<void> {
    fixture = TestBed.createComponent(ChartList);
    fixture.componentRef.setInput('items', items);
    fixture.componentRef.setInput('series', catalog);
    fixture.componentRef.setInput('sections', options.sections ?? true);
    fixture.componentRef.setInput('busy', options.busy ?? false);
    events = [];
    fixture.componentInstance.add.subscribe((added) => events.push(['add', added]));
    fixture.componentInstance.remove.subscribe((i) => events.push(['remove', i.id]));
    fixture.componentInstance.changeChart.subscribe(({ item, change }) => events.push(['change', item.id, change]));
    fixture.componentInstance.reorder.subscribe((ids) => events.push(['reorder', ids]));
    fixture.componentInstance.rename.subscribe(({ from, to }) => events.push(['rename', from, to]));
    await fixture.whenStable();
  }

  /** Opens a select and picks the option that starts with `label`. */
  async function choose(select: HTMLElement, label: string): Promise<void> {
    select.click();
    await fixture.whenStable();
    const option = Array.from(document.querySelectorAll<HTMLElement>('mat-option')).find((o) => text(o).startsWith(label));
    expect(option, `no option "${label}"`).toBeDefined();
    option!.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChartList],
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    }).compileComponents();
  });

  it('the charts by section, as the statistics page shows them, each with its description, chart and interval', async () => {
    await render(page);

    expect(all<HTMLInputElement>('.section-name input').map((i) => i.value)).toEqual(['Money', 'Habits', '']);
    expect(all<HTMLInputElement>('.section-name input')[2]!.placeholder).toBe('No section');
    expect(all('.group').map((g) => Array.from(g.querySelectorAll('.label')).map(text))).toEqual([
      ['Cost', 'Unit price'],
      ['Hour of the day'],
      ['series.gone'],
    ]);
    expect(texts('.description')).toEqual(['What Cost is.', 'What Unit price is.', 'What Hour of the day is.', 'Not a series any more: remove it.']);
    expect(texts('.type .mat-mdc-select-value')).toEqual(['Bars', 'Lines', 'Bars']);
    // the hours of the day have no interval; a series that is gone has nothing to choose
    expect(texts('.per .mat-mdc-select-value')).toEqual(['month', 'month']);
    expect(texts('.section .mat-mdc-select-value')).toEqual(['Money', 'Money', 'Habits']);
  });

  it('up and down move a chart within its section; a section moves with its charts', async () => {
    await render(page);
    const [costUp, , hoursUp] = all<HTMLButtonElement>('.item .up');
    const [costDown, priceDown, hoursDown] = all<HTMLButtonElement>('.item .down');
    expect([costUp!.disabled, costDown!.disabled, priceDown!.disabled, hoursUp!.disabled, hoursDown!.disabled]).toEqual([true, false, true, true, true]);

    costDown!.click();
    all<HTMLButtonElement>('.section-down')[0]!.click(); // Money after Habits
    all<HTMLButtonElement>('.section-up')[2]!.click(); // the charts without a section before Habits
    expect(all<HTMLButtonElement>('.section-up')[0]!.disabled).toBe(true);
    expect(all<HTMLButtonElement>('.section-down')[2]!.disabled).toBe(true);

    expect(events).toEqual([
      ['reorder', [3, 1, 2, 4]],
      ['reorder', [2, 1, 3, 4]],
      ['reorder', [1, 3, 4, 2]],
    ]);
  });

  it('its chart, its interval and its section change at once; "New section" names one no section has', async () => {
    await render([...page, chart(5, 'series.cost', 'New section')]);

    await choose(all<HTMLElement>('.type mat-select')[0]!, 'Lines');
    await choose(all<HTMLElement>('.per mat-select')[0]!, 'week');
    await choose(all<HTMLElement>('.section mat-select')[0]!, 'Habits');
    await choose(all<HTMLElement>('.section mat-select')[0]!, 'No section');
    await choose(all<HTMLElement>('.section mat-select')[0]!, 'New section…');

    expect(events).toEqual([
      ['change', 1, { chart: 'line' }],
      ['change', 1, { scale: 'week' }],
      ['change', 1, { section: 'Habits' }],
      ['change', 1, { section: null }],
      ['change', 1, { section: 'New section 2' }],
    ]);
  });

  it('a section renamed renames every chart in it; the charts without one can be given a name', async () => {
    await render(page);
    const [money, , none] = all<HTMLInputElement>('.section-name input');

    money!.value = 'Spending';
    money!.dispatchEvent(new Event('change'));
    none!.value = 'Other';
    none!.dispatchEvent(new Event('change'));

    expect(events).toEqual([
      ['rename', 'Money', 'Spending'],
      ['rename', null, 'Other'],
    ]);
  });

  it('adds a chart of any series: its first chart, per week, at the end of the last section', async () => {
    await render(page.slice(0, 3));

    all<HTMLElement>('.add mat-select')[0]!.click();
    await fixture.whenStable();
    expect(Array.from(document.querySelectorAll('mat-option')).map(text)).toEqual([
      'Cost What Cost is.',
      'Unit price What Unit price is.',
      'Hour of the day What Hour of the day is.',
    ]);
    (document.querySelectorAll<HTMLElement>('mat-option')[1]!).click();
    await fixture.whenStable();
    await choose(all<HTMLElement>('.add mat-select')[0]!, 'Hour of the day');

    expect(events).toEqual([
      ['add', { metric: 'series.unitPrice', chart: 'line', scale: 'week', section: 'Habits' }],
      ['add', { metric: 'series.hourOfDay', chart: 'bar', scale: null, section: 'Habits' }],
    ]);
  });

  it('without sections (the substance page): one list, no section to choose', async () => {
    await render(
      [chart(7, 'series.cost', null), chart(8, 'series.hourOfDay', null, 'line', null)].map((c) => ({ ...c, surface: 'substance' as const })),
      { sections: false },
    );

    expect(all('.section-name').length).toBe(0);
    expect(all('.section').length).toBe(0);
    expect(texts('.label')).toEqual(['Cost', 'Hour of the day']);
    all<HTMLButtonElement>('.item .down')[0]!.click();
    all<HTMLButtonElement>('.item .remove')[1]!.click();
    await choose(all<HTMLElement>('.add mat-select')[0]!, 'Cost');

    expect(events).toEqual([
      ['reorder', [8, 7]],
      ['remove', 8],
      ['add', { metric: 'series.cost', chart: 'bar', scale: 'week', section: null }],
    ]);
  });

  it('asks nothing while a write runs', async () => {
    await render(page, { busy: true });

    expect(all<HTMLButtonElement>('button').every((b) => b.disabled)).toBe(true);
    expect(all<HTMLInputElement>('.section-name input').every((i) => i.disabled)).toBe(true);
    expect(all('mat-select').every((s) => s.getAttribute('aria-disabled') === 'true')).toBe(true);
  });
});
