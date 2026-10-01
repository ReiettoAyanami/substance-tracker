import { SeriesData, SeriesLine } from '../../data/series';
import { ChartColors, chartOptions, lineLabel, periodLabel, valueFormat } from './chart-options';

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
  onSurface: 'rgba(1, 1, 1, 1)',
  onSurfaceVariant: 'rgba(2, 2, 2, 1)',
  outline: 'rgba(3, 3, 3, 1)',
  outlineVariant: 'rgba(4, 4, 4, 1)',
  surface: 'rgba(5, 5, 5, 1)',
  lines: { 'substance:4': 'rgba(10, 0, 0, 1)', 'substance:1': 'rgba(0, 10, 0, 1)' },
};

const options = (input: Partial<Parameters<typeof chartOptions>[0]>) =>
  chartOptions({ data, type: 'bar', unit: 'money', currency: 'EUR', timeZone: 'Europe/Rome', hidden: new Set(), colors, ...input }) as any;

describe('chartOptions', () => {
  it('bars of money stand one on the other, each line in its colour, on a transparent background', () => {
    const o = options({});
    expect(o.backgroundColor).toBe('transparent');
    expect(o.xAxis.data).toEqual(['W36', 'W37']);
    expect(o.series.map((s: any) => [s.type, s.name, s.data, s.stack, s.itemStyle.color])).toEqual([
      ['bar', 'Birra', [4, 3], 'total', 'rgba(10, 0, 0, 1)'],
      ['bar', 'Caffè', [0, 0.3], 'total', 'rgba(0, 10, 0, 1)'],
    ]);
    expect(o.yAxis.axisLabel.formatter(3)).toBe('€3.00');
    expect(o.tooltip.valueFormatter(0.3)).toBe('€0.30');
    expect(o.tooltip.valueFormatter(null)).toBe('—');
    expect(o.tooltip.confine).toBe(true);
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
  });

  it('quantities of one unit add up: their bars stand one on the other (a substance by batch)', () => {
    const batches = { ...data, by: 'batch' as const, series: [line('batch:7', 'batch', 7, 'Lavazza', ['1', '2'], '3', 'cup'), line('one-time:1', 'one_time', 1, null, ['0', '1'], '1', 'cup')] };
    expect(options({ unit: 'quantity', data: batches }).series.map((s: any) => s.stack)).toEqual(['total', 'total']);
    // a line hidden by hand does not change how the others stand
    expect(options({ unit: 'quantity', data: { ...batches, series: [...batches.series, line('substance:4', 'substance', 4, 'Birra', ['1', '1'], '2')] }, hidden: new Set(['substance:4']) }).series.map((s: any) => s.stack)).toEqual([undefined, undefined]);
    // prices never add up
    expect(options({ unit: 'unitPrice', data: batches }).series.map((s: any) => s.stack)).toEqual([undefined, undefined]);
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
