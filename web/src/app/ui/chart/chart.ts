import { Component, DestroyRef, ElementRef, computed, inject, input, signal } from '@angular/core';
import { MatChipListboxChange, MatChipsModule } from '@angular/material/chips';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';

import { ChartType, SeriesData, SeriesDefinition, SeriesLine } from '../../data/series';
import { Settings } from '../../data/settings';
import { IdentityColorPipe } from '../identity-color-pipe';
import { ChartColors, chartOptions, lineLabel } from './chart-options';

// Only the pieces the charts use (the modular import): three kinds of chart, their grid and
// tooltip, and the SVG renderer. The whole of ECharts is never bundled.
echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, SVGRenderer]);

const identity = new IdentityColorPipe();

/** A line's colour as CSS: its substance's or its batch's identity colour; the one-time line is neutral. */
export function lineColor(line: SeriesLine): string {
  if (line.kind === 'one_time') return 'var(--mat-sys-outline)';
  return identity.transform(line.id, line.kind);
}

/**
 * A chart (design-statistics.md, "chart"): the only component that knows the chart library
 * (Apache ECharts, through ngx-echarts). A series of the API in, a chart out: bars, lines or a
 * donut of the totals, drawn in SVG with the Material 3 colours of the theme (read from its tokens,
 * again when the system switches between light and dark) and each line in its identity colour.
 * Material filter chips above it hide lines by hand (a substance, a batch), when `filters` is on
 * and there is more than one. It computes nothing: every number is the API's.
 */
@Component({
  selector: 'app-chart',
  imports: [MatChipsModule, NgxEchartsDirective],
  providers: [provideEchartsCore({ echarts })],
  templateUrl: './chart.html',
  styleUrl: './chart.css',
})
export class Chart {
  readonly data = input.required<SeriesData>();
  readonly type = input.required<ChartType>();
  readonly unit = input.required<SeriesDefinition['unit']>();
  /** The currency of every amount, and the zone of the days a batch was bought. */
  readonly settings = input.required<Settings>();
  /** The chips that hide lines by hand. */
  readonly filters = input(true);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The lines hidden by hand: they stay hidden while the chart is shown. */
  protected readonly hidden = signal<ReadonlySet<string>>(new Set());
  /** The system is dark: the theme's colours change, and the chart is drawn again. */
  private readonly dark = signal(false);

  constructor() {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (query) {
      this.dark.set(query.matches);
      const changed = (event: MediaQueryListEvent) => this.dark.set(event.matches);
      query.addEventListener('change', changed);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', changed));
    }
  }

  protected label(line: SeriesLine): string {
    return lineLabel(line, this.settings().timezone);
  }
  protected readonly color = lineColor;

  /** The theme's colours and the lines', resolved to what ECharts can draw. */
  private readonly colors = computed<ChartColors>(() => {
    this.dark();
    const lines = this.data().series;
    return resolveColors(this.host.nativeElement, (resolve) => ({
      onSurface: resolve('var(--mat-sys-on-surface)'),
      onSurfaceVariant: resolve('var(--mat-sys-on-surface-variant)'),
      outline: resolve('var(--mat-sys-outline)'),
      outlineVariant: resolve('var(--mat-sys-outline-variant)'),
      surface: resolve('var(--mat-sys-surface-container-high)'),
      lines: Object.fromEntries(lines.map((line) => [line.key, resolve(lineColor(line))])),
    }));
  });

  protected readonly options = computed(() =>
    chartOptions({
      data: this.data(),
      type: this.type(),
      unit: this.unit(),
      currency: this.settings().currency,
      timeZone: this.settings().timezone,
      hidden: this.hidden(),
      colors: this.colors(),
    }),
  );

  /** The chips chosen are the lines shown. */
  protected choose(change: MatChipListboxChange): void {
    const shown = new Set<string>(change.value as string[]);
    this.hidden.set(new Set(this.data().series.map((line) => line.key).filter((key) => !shown.has(key))));
  }
}

/**
 * Resolves CSS colours (tokens, identity colours made of var()) into rgba() ECharts can use: the
 * browser computes each on a hidden element, then a 1×1 canvas turns it into sRGB. Without a
 * canvas (tests), the computed colour as it is. The element is removed once `read` is done.
 */
function resolveColors<T>(host: HTMLElement, read: (resolve: (css: string) => string) => T): T {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  host.appendChild(probe);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext('2d', { willReadFrequently: true });
  } catch {
    context = null;
  }
  const resolve = (css: string): string => {
    probe.style.color = css;
    const computed = getComputedStyle(probe).color || css;
    if (!context) return computed;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = computed;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${((a ?? 255) / 255).toFixed(3)})`;
  };
  try {
    return read(resolve);
  } finally {
    probe.remove();
  }
}
