import { SeriesData, SeriesLine } from '../../data/series';
import { ChartColors, chartOptions, clockwise, currentPeriod, hatch, lastStretch, lineLabel, periodLabel, valueFormat } from './chart-options';

const line = (key: string, kind: SeriesLine['kind'], id: number, name: string | null, values: (string | null)[], total: string | null, unit = 'beer'): SeriesLine => ({
  key,
  kind,
  id,
  substanceId: id,
  name,
  unit,
  occurredAt: null,
  values,
  total,
});

const data: SeriesData = {
  metric: 'series.cost',
  per: 'week',
  by: 'substance',
  from: '2026-09-01',
  to: '2026-09-30',
  periods: ['2026-W36', '2026-W37'],
  series: [line('substance:4', 'substance', 4, 'Birra', ['4.00', '3.00'], '7.00'), line('substance:1', 'substance', 1, 'Caffè', ['0.00', '0.30'], '0.30')],
};

const colors: ChartColors = {
  primary: 'rgba(9, 9, 9, 1)',
  onSurface: 'rgba(1, 1, 1, 1)',
  onSurfaceVariant: 'rgba(2, 2, 2, 1)',
  outline: 'rgba(3, 3, 3, 1)',
  outlineVariant: 'rgba(4, 4, 4, 1)',
  surface: 'rgba(5, 5, 5, 1)',
  card: 'rgba(6, 6, 6, 1)',
  font: 'Roboto Mono',
  glass: 'rgba(7, 7, 7, 0.72)',
  glassFilter: 'blur(24px)',
  lines: { 'substance:4': 'rgba(10, 0, 0, 1)', 'substance:1': 'rgba(0, 10, 0, 1)' },
};

const options = (input: Partial<Parameters<typeof chartOptions>[0]>) =>
  chartOptions({ data, type: 'bar', unit: 'money', currency: 'EUR', timeZone: 'Europe/Rome', hidden: new Set(), colors, ...input }) as any;

describe('chartOptions', () => {
  it('bars of money stand one on the other, each line in its colour, on a transparent background', () => {
    const o = options({});
    expect(o.backgroundColor).toBe('transparent');
    expect(o.textStyle.fontFamily).toBe('Roboto Mono');
    expect(o.xAxis.data).toEqual(['W36', 'W37']);
    expect(o.series.map((s: any) => [s.type, s.name, s.data.map((d: any) => d.value), s.stack, s.itemStyle.color])).toEqual([
      ['bar', 'Birra', [4, 3], 'total', 'rgba(10, 0, 0, 1)'],
      ['bar', 'Caffè', [0, 0.3], 'total', 'rgba(0, 10, 0, 1)'],
    ]);
    expect(o.yAxis.axisLabel.formatter(3)).toBe('€3.00');
    expect(o.tooltip.valueFormatter(0.3)).toBe('€0.30');
    expect(o.tooltip.valueFormatter(null)).toBe('—');
    expect(o.tooltip.confine).toBe(true);
    // dark glass, like the Material tooltips
    expect(o.tooltip.backgroundColor).toBe('rgba(7, 7, 7, 0.72)');
    expect(o.tooltip.extraCssText).toContain('backdrop-filter: blur(24px);');
    expect(o.yAxis.splitLine.lineStyle.color).toBe('rgba(4, 4, 4, 1)');
  });

  it('quantities of different units side by side, named with their unit; lines join over the gaps', () => {
    const units = { ...data, series: [data.series[0]!, { ...data.series[1]!, unit: 'cup' }] };
    const bars = options({ unit: 'quantity', data: units });
    expect(bars.series.map((s: any) => [s.name, s.stack])).toEqual([
      ['Birra (beer)', undefined],
      ['Caffè (cup)', undefined],
    ]);
    const lines = options({ type: 'line', unit: 'unitPrice', data: { ...data, series: [line('substance:4', 'substance', 4, 'Birra', ['1.000000', null], '1.000000')] } });
    expect(lines.series[0]).toMatchObject({ type: 'line', data: [1, null], connectNulls: true });
    // nothing in the period in progress (a price with no purchase): no dashed stretch
    expect(lines.series).toHaveLength(1);
    expect(lines.series[0].smoothMonotone).toBe('x');
  });

  it('quantities of one unit add up: their bars stand one on the other (a substance by batch)', () => {
    const batches = { ...data, by: 'batch' as const, series: [line('batch:7', 'batch', 7, 'Lavazza', ['1', '2'], '3', 'cup'), line('one-time:1', 'one_time', 1, null, ['0', '1'], '1', 'cup')] };
    expect(options({ unit: 'quantity', data: batches }).series.map((s: any) => s.stack)).toEqual(['total', 'total']);
    // a line hidden by hand does not change how the others stand
    expect(options({ unit: 'quantity', data: { ...batches, series: [...batches.series, line('substance:4', 'substance', 4, 'Birra', ['1', '1'], '2')] }, hidden: new Set(['substance:4']) }).series.map((s: any) => s.stack)).toEqual([undefined, undefined]);
    // prices never add up
    expect(options({ unit: 'unitPrice', data: batches }).series.map((s: any) => s.stack)).toEqual([undefined, undefined]);
  });

  it('bars: rounded ends, square where pieces of a stack meet; the period in progress striped, its label violet', () => {
    const o = options({});
    // W36: Birra alone (Caffè is 0); W37: Caffè on Birra
    expect(o.series[0].data.map((d: any) => d.itemStyle.borderRadius)).toEqual([
      [6, 6, 6, 6],
      [0, 0, 6, 6],
    ]);
    expect(o.series[1].data.map((d: any) => d.itemStyle.borderRadius)).toEqual([
      [0, 0, 0, 0],
      [6, 6, 0, 0],
    ]);
    expect(o.series[0].data[0].itemStyle.decal).toBeUndefined();
    expect(o.series[0].data[1].itemStyle.decal).toEqual(hatch('rgba(6, 6, 6, 1)'));
    expect(o.xAxis.axisLabel.color('W37', 1)).toBe('rgba(9, 9, 9, 1)');
    expect(o.xAxis.axisLabel.color('W36', 0)).toBe('rgba(2, 2, 2, 1)');
    expect(o.xAxis.axisLine.show).toBe(false);
    // side by side, every bar rounded at both ends
    const prices = options({ unit: 'unitPrice' });
    expect(prices.series[0].data[0].itemStyle.borderRadius).toBe(6);
  });

  it('the period in progress is the last one; the hours of the day have none', () => {
    expect(currentPeriod(data)).toBe(1);
    expect(currentPeriod({ ...data, per: null, periods: ['00', '01'] })).toBeNull();
    expect(lastStretch([1, null, 2, null, 5], 4)).toEqual([null, null, 2, null, 5]);
    expect(lastStretch([null, null, 5], 2)).toEqual([null, null, 5]);
  });

  it("lines: each name once in the tooltip, with its value, the user's names as text", () => {
    const o = options({ type: 'line', data: { ...data, series: [line('substance:4', 'substance', 4, '<b>Birra</b>', ['4.00', '3.00'], '7.00')] } });
    expect(o.series.map((s: any) => [s.data, s.lineStyle.type])).toEqual([
      [[4, null], undefined],
      [[4, 3], 'dashed'],
    ]);
    const tip = o.tooltip.formatter([
      { axisValueLabel: 'W37', seriesName: '<b>Birra</b>', marker: '•', value: null },
      { axisValueLabel: 'W37', seriesName: '<b>Birra</b>', marker: '•', value: 3 },
    ]);
    expect(tip).toBe('W37<br/>•&lt;b&gt;Birra&lt;/b&gt; <b>€3.00</b>');
  });

  it('leaves out the lines hidden by hand', () => {
    const o = options({ hidden: new Set(['substance:4']) });
    expect(o.series.map((s: any) => s.name)).toEqual(['Caffè']);
  });

  it("a donut of the lines' totals, none for a line with nothing", () => {
    const o = options({ type: 'donut', data: { ...data, series: [...data.series, line('substance:3', 'substance', 3, 'Erba', ['0.00', '0.00'], '0.00')] } });
    expect(o.series[0].type).toBe('pie');
    expect(o.series[0].label.formatter).toBe('{d}%');
    expect(o.series[0].data).toEqual([
      { name: 'Birra', value: 7, itemStyle: { color: 'rgba(10, 0, 0, 1)' } },
      { name: 'Caffè', value: 0.3, itemStyle: { color: 'rgba(0, 10, 0, 1)' } },
    ]);
    expect(o.tooltip.trigger).toBe('item');
  });

  it("a treemap of the lines' totals: rounded tiles with the name and the share, dark on the colour", () => {
    const o = options({ type: 'treemap', data: { ...data, series: [...data.series, line('substance:3', 'substance', 3, 'Erba', ['0.00', '0.00'], '0.00')] } });
    expect(o.series[0].type).toBe('treemap');
    expect(o.series[0].data).toEqual([
      { name: 'Birra', value: 7, itemStyle: { color: 'rgba(10, 0, 0, 1)' } },
      { name: 'Caffè', value: 0.3, itemStyle: { color: 'rgba(0, 10, 0, 1)' } },
    ]);
    expect(o.series[0].label.formatter({ name: 'Birra', value: 7 })).toBe('Birra\n96%');
    expect(o.series[0].label.color).toBe('rgba(6, 6, 6, 1)');
    expect(o.series[0].nodeClick).toBe(false);
    expect(o.tooltip.trigger).toBe('item');
  });

  it('a radar: the periods around, one scale for every spoke, a shape per line, the period in progress violet', () => {
    const o = options({ type: 'radar' });
    expect(o.radar.indicator).toEqual([
      { name: 'W36', max: 4 },
      { name: 'W37', max: 4, color: 'rgba(9, 9, 9, 1)' },
    ]);
    expect(o.series[0].data.map((d: any) => [d.name, d.value, d.lineStyle.color])).toEqual([
      ['Birra', [4, 3], 'rgba(10, 0, 0, 1)'],
      ['Caffè', [0, 0.3], 'rgba(0, 10, 0, 1)'],
    ]);
    // past a dozen periods, a name on one spoke every so many (and on the one in progress)
    const days = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
    const month = options({ type: 'radar', data: { ...data, per: 'day', periods: days, series: [line('substance:4', 'substance', 4, 'Birra', days.map(() => '0'), '0')] } });
    expect(month.radar.indicator.filter((i: any) => i.name !== '').map((i: any) => i.name)).toEqual(['1 Sept', '30 Sept', '28 Sept', '25 Sept', '22 Sept', '19 Sept', '16 Sept', '13 Sept', '10 Sept', '7 Sept', '4 Sept']);
    expect(month.radar.indicator[0].max).toBe(1); // nothing at all: still a circle
    // clockwise, like a clock: after the first spoke ECharts gets them in reverse
    expect(clockwise(4)).toEqual([0, 3, 2, 1]);
    const hours = options({ type: 'radar', data: { ...data, per: null, periods: ['00', '01', '02'], series: [line('substance:4', 'substance', 4, 'Birra', ['1', '2', '3'], '6')] } });
    expect(hours.radar.indicator.map((i: any) => i.name)).toEqual(['00:00', '02:00', '01:00']);
    expect(hours.series[0].data[0].value).toEqual([1, 3, 2]);
  });

  it('names the lines and the periods', () => {
    // a batch with the day it was bought (in the zone of the settings); the year only when it is not this one
    const bought = (name: string | null) => ({ ...line('batch:7', 'batch', 7, name, [], null), occurredAt: '2026-09-19T22:30:00Z' });
    const now = new Date('2026-10-01T08:00:00Z');
    expect(lineLabel(bought(null), 'Europe/Rome', now)).toBe('Unnamed batch · 20 Sept');
    expect(lineLabel(bought('Lavazza'), 'UTC', now)).toBe('Lavazza · 19 Sept');
    expect(lineLabel(bought(null), 'Europe/Rome', new Date('2027-01-02T08:00:00Z'))).toBe('Unnamed batch · 20 Sept 2026');
    // the new year comes in the zone of the settings: 31 Dec 23:30 UTC is already next year in Rome
    expect(lineLabel({ ...bought(null), occurredAt: '2026-12-31T23:30:00Z' }, 'Europe/Rome', new Date('2027-01-01T00:10:00Z'))).toBe('Unnamed batch · 1 Jan');
    expect(lineLabel(line('one-time:4', 'one_time', 4, null, [], null), 'Europe/Rome')).toBe('One-time');
    expect(lineLabel(line('substance:4', 'substance', 4, 'Birra', [], null), 'Europe/Rome')).toBe('Birra');
    expect(['2026-09-29', '2026-W40', '2026-09', '2026', '20'].map(periodLabel)).toEqual(['29 Sept', 'W40', 'Sept 2026', '2026', '20:00']);
    expect(valueFormat('count', 'EUR')(3)).toBe('3');
    expect(valueFormat('unitPrice', 'EUR')(0.3456)).toBe('€0.3456');
  });
});
