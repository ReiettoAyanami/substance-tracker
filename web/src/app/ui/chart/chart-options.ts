// The ECharts options of a chart (ui/chart), from a series of the API and the colours of the theme.
// A plain module (no schematic makes one): pure functions, tested on their own.

import { ChartType, SeriesData, SeriesDefinition, SeriesLine } from '../../data/series';
import { LOCALE } from '../../locale';

/** The colours a chart takes from the Material 3 theme, resolved (ECharts needs real colours). */
export interface ChartColors {
  /** The theme's violet: the period in progress. */
  primary: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  surface: string;
  /** The widget's card under the chart: the gaps between slices and tiles, the text on a tile. */
  card: string;
  /** Each line's colour, by its key. */
  lines: Record<string, string>;
}

/**
 * What a line is called: its substance; its batch ("Unnamed batch") with the day it was bought, in
 * the zone of the settings, the year only when it is not this one (a chip on a phone keeps the day:
 * it is what tells the unnamed batches apart); or "One-time".
 */
export function lineLabel(line: SeriesLine, timeZone: string, now: Date = new Date()): string {
  if (line.kind === 'one_time') return 'One-time';
  if (line.kind === 'batch') {
    const name = line.name ?? 'Unnamed batch';
    if (line.occurredAt === null) return name;
    const bought = new Date(line.occurredAt);
    const year = new Intl.DateTimeFormat(LOCALE, { timeZone, year: 'numeric' });
    const thisYear = year.format(bought) === year.format(now);
    const day = new Intl.DateTimeFormat(LOCALE, { timeZone, day: 'numeric', month: 'short', ...(thisYear ? {} : { year: 'numeric' }) });
    return `${name} · ${day.format(bought)}`;
  }
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
  /** The zone of the settings: the day a batch was bought. */
  timeZone: string;
  /** The lines hidden by hand (their keys). */
  hidden: ReadonlySet<string>;
  colors: ChartColors;
}

/** The API's decimal strings as numbers, to be drawn (the numbers themselves are the API's). */
const drawn = (value: string | null): number | null => (value === null ? null : Number(value));

/** How round the bars and the donut's slices are, in px (the reference photo: rounded ends). */
const RADIUS = 6;

/**
 * The period in progress, by its index: the last one. Every series the web asks ends today (the
 * last N days, or all time: `to` is today), so its last period is the one still going on, not
 * complete yet. None for the hours of the day, which are not a time line.
 */
export function currentPeriod(data: SeriesData): number | null {
  return data.per === null || data.periods.length === 0 ? null : data.periods.length - 1;
}

/** Oblique stripes over a bar (ECharts' decal): the period in progress, in the theme's violet. */
export function hatch(color: string): Record<string, unknown> {
  return { symbol: 'rect', symbolSize: 1, dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: -Math.PI / 4, color };
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** A name of the user's in the tooltip's HTML: as text, never as markup. */
const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);

/** One entry of ECharts' axis tooltip, as its formatter receives it. */
interface TooltipEntry {
  axisValueLabel: string;
  seriesName: string;
  marker: string;
  value: number | null | undefined;
}

/**
 * The options of the chart: bars (stacked when the lines add up), lines, a radar, or a donut or a
 * treemap of the lines' totals. Transparent background, text and a faint grid in the theme's colours, no axis lines, each
 * line in its identity colour (design-frontend.md, "chart style"): bars with rounded ends, the
 * period in progress striped in violet with its label violet too; soft lines whose last stretch,
 * into the period in progress, is dashed. The quantities of different units are named with their
 * unit.
 */
export function chartOptions({ data, type, unit, currency, timeZone, hidden, colors }: ChartInput): Record<string, unknown> {
  const format = valueFormat(unit, currency);
  const lines = data.series.filter((line) => !hidden.has(line.key));
  const name = (line: SeriesLine) => (unit === 'quantity' ? `${lineLabel(line, timeZone)} (${line.unit})` : lineLabel(line, timeZone));
  const valueFormatter = (value: number | null | undefined) => (value === null || value === undefined ? '—' : format(value));
  const tooltip = {
    // inside the chart, never cut by its card; a long name goes to the next line
    confine: true,
    extraCssText: 'max-width: 280px; white-space: normal;',
    backgroundColor: colors.surface,
    borderColor: colors.outlineVariant,
    textStyle: { color: colors.onSurface },
    valueFormatter,
  };
  // a little slower than ECharts' 300 ms (lenzi, 2026-10-02: "poco più lente"): drawn in 600, redrawn in 500
  const base = { backgroundColor: 'transparent', animationDuration: 600, animationDurationUpdate: 500, textStyle: { color: colors.onSurfaceVariant } };

  if (type === 'donut') {
    return {
      ...base,
      tooltip: { ...tooltip, trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: colors.card, borderWidth: 2, borderRadius: RADIUS },
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

  if (type === 'treemap') {
    // Rounded tiles as large as each line's total, its name and its share written on it (the
    // reference photo), dark on the bright identity colours. The share is only how the total
    // compares with the others shown, as the donut's.
    const shown = lines.filter((line) => line.total !== null && Number(line.total) > 0);
    const whole = shown.reduce((sum, line) => sum + Number(line.total), 0);
    return {
      ...base,
      tooltip: { ...tooltip, trigger: 'item' },
      series: [
        {
          type: 'treemap',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          itemStyle: { borderColor: colors.card, borderWidth: 4, gapWidth: 4, borderRadius: 12 },
          label: {
            position: 'insideTopLeft',
            padding: 8,
            color: colors.card,
            fontWeight: 500,
            overflow: 'truncate',
            formatter: (tile: { name: string; value: number }) => `${tile.name}\n${Math.round((tile.value / whole) * 100)}%`,
          },
          data: shown.map((line) => ({ name: name(line), value: Number(line.total), itemStyle: { color: colors.lines[line.key] } })),
        },
      ],
    };
  }

  const current = currentPeriod(data);

  if (type === 'radar') {
    // The periods around a circle, clockwise from the top like a clock (the hours of the day are
    // one), one shape per line with its area lightly filled; one scale for every spoke, so the
    // shapes compare. A name on every spoke up to a dozen, past that on one every so many; the
    // period in progress named in violet. ECharts goes round the other way: the spokes are given to
    // it in reverse after the first.
    const order = clockwise(data.periods.length);
    const values = lines.map((line) => order.map((i) => drawn(line.values[i] ?? null)));
    const top = Math.max(0, ...values.flat().map((v) => v ?? 0));
    const every = Math.ceil(data.periods.length / 12);
    return {
      ...base,
      tooltip: { ...tooltip, trigger: 'item' },
      radar: {
        radius: '68%',
        indicator: order.map((i) => ({
          name: i % every === 0 || i === current ? periodLabel(data.periods[i]!) : '',
          max: top > 0 ? top : 1,
          ...(i === current ? { color: colors.primary } : {}),
        })),
        axisName: { color: colors.onSurfaceVariant },
        axisLine: { lineStyle: { color: colors.outlineVariant } },
        splitLine: { lineStyle: { color: colors.outlineVariant } },
        splitArea: { show: false },
      },
      series: [
        {
          type: 'radar',
          symbol: 'none',
          data: lines.map((line, i) => ({
            name: name(line),
            value: values[i],
            itemStyle: { color: colors.lines[line.key] },
            lineStyle: { color: colors.lines[line.key], width: 2 },
            areaStyle: { color: colors.lines[line.key], opacity: 0.15 },
          })),
        },
      ],
    };
  }

  // Bars of amounts that add up stand one on the other: money, counts, and quantities when every line
  // is in one unit (a substance by batch); quantities of different units and prices side by side.
  // Every line counts, the hidden ones too: hiding one does not change how the others stand.
  const oneUnit = new Set(data.series.map((line) => line.unit)).size === 1;
  const stacked = type === 'bar' && (unit === 'money' || unit === 'count' || (unit === 'quantity' && oneUnit));
  const axes = {
    // The axis labels stay inside the chart (ECharts 6's name for the old containLabel).
    grid: { left: 8, right: 16, top: 16, bottom: 8, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: {
      type: 'category',
      data: data.periods.map(periodLabel),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: (_: string, index: number) => (index === current ? colors.primary : colors.onSurfaceVariant) },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: colors.outlineVariant } },
      axisLabel: { color: colors.onSurfaceVariant, formatter: (v: number) => format(v) },
    },
  };

  if (type === 'bar') {
    return {
      ...base,
      ...axes,
      tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
      series: lines.map((line, index) => ({
        type: 'bar',
        name: name(line),
        barMaxWidth: 32,
        data: line.values.map((value, period) => ({
          value: drawn(value),
          itemStyle: {
            borderRadius: stacked ? stackRadius(lines, index, period) : RADIUS,
            ...(period === current ? { decal: hatch(colors.primary) } : {}),
          },
        })),
        itemStyle: { color: colors.lines[line.key] },
        ...(stacked ? { stack: 'total' } : {}),
      })),
    };
  }

  // Lines: the stretch into the period in progress is a series of its own, dashed, with the line's
  // name; the tooltip shows each name once, with the value it has there. A price with no purchase in
  // the period in progress has no stretch.
  const showSymbol = data.periods.length <= 12;
  return {
    ...base,
    ...axes,
    tooltip: { ...tooltip, trigger: 'axis', formatter: (entries: TooltipEntry[]) => axisTooltip(entries, valueFormatter) },
    series: lines.flatMap((line) => {
      const values = line.values.map(drawn);
      const color = colors.lines[line.key];
      // soft, but never past its points: a curve does not dip under zero between two values
      const style = { type: 'line', name: name(line), itemStyle: { color }, smooth: 0.3, smoothMonotone: 'x', connectNulls: true, showSymbol };
      // nothing yet in the period in progress: no stretch to draw
      if (current === null || values[current] === null) return [{ ...style, data: values, lineStyle: { color, width: 2.5 } }];
      return [
        { ...style, data: values.map((v, i) => (i === current ? null : v)), lineStyle: { color, width: 2.5 } },
        { ...style, data: lastStretch(values, current), lineStyle: { color, width: 2.5, type: 'dashed' } },
      ];
    }),
  };
}

/**
 * The values of a line's dashed stretch: its last value before the period in progress and the one
 * in it; nothing else.
 */
export function lastStretch(values: (number | null)[], current: number): (number | null)[] {
  let before = -1;
  for (let i = current - 1; i >= 0 && before < 0; i--) if (values[i] !== null) before = i;
  return values.map((v, i) => (i === current || i === before ? v : null));
}

/** The axis tooltip of the lines: the period, then each line once (its value where it has one). */
function axisTooltip(entries: TooltipEntry[], format: (value: number | null | undefined) => string): string {
  const seen = new Map<string, TooltipEntry>();
  for (const entry of entries) {
    const known = seen.get(entry.seriesName);
    if (!known || ((known.value ?? null) === null && (entry.value ?? null) !== null)) seen.set(entry.seriesName, entry);
  }
  const rows = [...seen.values()].map((e) => `${e.marker}${escapeHtml(e.seriesName)} <b>${escapeHtml(format(e.value))}</b>`);
  return [escapeHtml(entries[0]?.axisValueLabel ?? ''), ...rows].join('<br/>');
}

/**
 * The corners of a stacked bar's piece: the top piece of a period rounds its top, the bottom piece
 * its bottom (a piece alone, both); the pieces between stay square. Only the pieces drawn count.
 */
function stackRadius(lines: SeriesLine[], index: number, period: number): number[] {
  const drawnHere = lines.map((line, i) => (Number(line.values[period] ?? 0) > 0 ? i : -1)).filter((i) => i >= 0);
  const top = index === drawnHere[drawnHere.length - 1] ? RADIUS : 0;
  const bottom = index === drawnHere[0] ? RADIUS : 0;
  return [top, top, bottom, bottom];
}

/** The order in which ECharts gets the spokes of a radar so that they read clockwise: 0, n-1, …, 1. */
export function clockwise(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i === 0 ? 0 : count - i));
}
