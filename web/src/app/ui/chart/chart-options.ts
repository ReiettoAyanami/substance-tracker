// The ECharts options of a chart (ui/chart), from a series of the API and the colours of the theme.
// A plain module (no schematic makes one): pure functions, tested on their own.

import { ChartType, SeriesData, SeriesDefinition, SeriesLine } from '../../data/series';
import { LOCALE } from '../../locale';

/** The colours a chart takes from the Material 3 theme, resolved (ECharts needs real colours). */
export interface ChartColors {
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  surface: string;
  /** Each line's colour, by its key. */
  lines: Record<string, string>;
}

/** What a line is called: its substance, its batch ("Unnamed batch"), or "One-time". */
export function lineLabel(line: SeriesLine): string {
  if (line.kind === 'one_time') return 'One-time';
  if (line.kind === 'batch') return line.name ?? 'Unnamed batch';
  return line.name ?? '';
}

const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthYear = new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** A period as the axis shows it: "29 Sept", "W40", "Sept 2026", "2026", "20:00". */
export function periodLabel(period: string): string {
  if (/^\d{2}$/.test(period)) return `${period}:00`;
  if (/^\d{4}-W\d{2}$/.test(period)) return period.slice(5);
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return dayMonth.format(new Date(`${period}T00:00:00Z`));
  if (/^\d{4}-\d{2}$/.test(period)) return monthYear.format(new Date(`${period}-01T00:00:00Z`));
  return period;
}

/** How a value of the series reads in a tooltip or on the axis. */
export function valueFormat(unit: SeriesDefinition['unit'], currency: string): (value: number) => string {
  switch (unit) {
    case 'money': {
      const money = new Intl.NumberFormat(LOCALE, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return (v) => money.format(v);
    }
    case 'unitPrice': {
      const price = new Intl.NumberFormat(LOCALE, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 });
      return (v) => price.format(v);
    }
    case 'count': {
      const count = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
      return (v) => count.format(v);
    }
    default: {
      const quantity = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 });
      return (v) => quantity.format(v);
    }
  }
}

export interface ChartInput {
  data: SeriesData;
  type: ChartType;
  unit: SeriesDefinition['unit'];
  currency: string;
  /** The lines hidden by hand (their keys). */
  hidden: ReadonlySet<string>;
  colors: ChartColors;
}

/** The API's decimal strings as numbers, to be drawn (the numbers themselves are the API's). */
const drawn = (value: string | null): number | null => (value === null ? null : Number(value));

/**
 * The options of the chart: bars (stacked when the lines add up), lines, or a donut of the lines'
 * totals. Transparent background, text and grid in the theme's colours, each line in its identity
 * colour; the quantities of different units are named with their unit.
 */
export function chartOptions({ data, type, unit, currency, hidden, colors }: ChartInput): Record<string, unknown> {
  const format = valueFormat(unit, currency);
  const lines = data.series.filter((line) => !hidden.has(line.key));
  const name = (line: SeriesLine) => (unit === 'quantity' ? `${lineLabel(line)} (${line.unit})` : lineLabel(line));
  const tooltip = {
    // inside the chart, never cut by its card; a long name goes to the next line
    confine: true,
    extraCssText: 'max-width: 280px; white-space: normal;',
    backgroundColor: colors.surface,
    borderColor: colors.outlineVariant,
    textStyle: { color: colors.onSurface },
    valueFormatter: (value: number | null) => (value === null || value === undefined ? '—' : format(value)),
  };
  const base = { backgroundColor: 'transparent', animationDuration: 300, textStyle: { color: colors.onSurfaceVariant } };

  if (type === 'donut') {
    return {
      ...base,
      tooltip: { ...tooltip, trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: colors.surface, borderWidth: 2 },
          // the share only: the chips above name the slices, and long names do not fit a phone
          percentPrecision: 0,
          label: { color: colors.onSurface, formatter: '{d}%' },
          data: lines
            .filter((line) => line.total !== null && Number(line.total) > 0)
            .map((line) => ({ name: name(line), value: Number(line.total), itemStyle: { color: colors.lines[line.key] } })),
        },
      ],
    };
  }

  // Bars of amounts that add up (money, counts) stand one on the other; quantities and prices side by side.
  const stacked = type === 'bar' && (unit === 'money' || unit === 'count');
  return {
    ...base,
    tooltip: { ...tooltip, trigger: 'axis' },
    // The axis labels stay inside the chart (ECharts 6's name for the old containLabel).
    grid: { left: 8, right: 16, top: 16, bottom: 8, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: {
      type: 'category',
      data: data.periods.map(periodLabel),
      axisLine: { lineStyle: { color: colors.outline } },
      axisLabel: { color: colors.onSurfaceVariant },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: colors.outlineVariant } },
      axisLabel: { color: colors.onSurfaceVariant, formatter: (v: number) => format(v) },
    },
    series: lines.map((line) => ({
      type,
      name: name(line),
      data: line.values.map(drawn),
      itemStyle: { color: colors.lines[line.key] },
      lineStyle: type === 'line' ? { color: colors.lines[line.key], width: 2 } : undefined,
      ...(stacked ? { stack: 'total' } : {}),
      ...(type === 'line' ? { connectNulls: true, showSymbol: data.periods.length <= 31, smooth: false } : {}),
    })),
  };
}
