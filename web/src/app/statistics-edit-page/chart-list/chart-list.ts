import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';

import { ChartType, SeriesDefinition } from '../../data/series';
import { ChartChange, ViewItem } from '../../data/view-item';
import { sectionsOf } from '../../statistics-page/sections';

/** A chart to add: its series, drawn how, in which interval, in which section. */
export interface NewChart {
  metric: string;
  chart: ChartType;
  scale: string | null;
  section: string | null;
}

/** The two choices of the section select that are not the name of a section. */
const NO_SECTION = { none: true } as const;
const NEW_SECTION = { new: true } as const;
type SectionChoice = string | typeof NO_SECTION | typeof NEW_SECTION;

/** How the charts are called in their select: whole words. */
const CHART_LABELS: Record<ChartType, string> = { bar: 'Bars', line: 'Lines', donut: 'Donut', treemap: 'Treemap', radar: 'Radar' };

/** A chart and its series (null: the catalog no longer has it). */
interface Row {
  item: ViewItem;
  series: SeriesDefinition | null;
  first: boolean;
  last: boolean;
}

interface Group {
  name: string | null;
  rows: Row[];
  first: boolean;
  last: boolean;
}

/**
 * The charts of one place (the statistics page, the substance page), as an editable list: each with
 * its series' description, the chart that draws it and its interval, moved up or down or removed;
 * below, every series to add (one can be drawn more than once). With `sections` (the statistics
 * page) the charts are grouped as the page shows them: each section's name can be changed (blank:
 * none), a section moves with its charts, a chart moves into another section or a new one. It only
 * asks: its page writes, and gives it the new list.
 */
@Component({
  selector: 'app-chart-list',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  templateUrl: './chart-list.html',
  styleUrl: './chart-list.css',
})
export class ChartList {
  /** The charts of this place, in order. */
  readonly items = input.required<ViewItem[]>();
  /** The series of the catalog. */
  readonly series = input.required<SeriesDefinition[]>();
  /** Grouped in sections (the statistics page). */
  readonly sections = input(false);
  /** A write is running: nothing more is asked until it ends. */
  readonly busy = input(false);

  readonly add = output<NewChart>();
  readonly remove = output<ViewItem>();
  /** Not `change`: the change events of the inputs inside bubble out of the element. */
  readonly changeChart = output<{ item: ViewItem; change: ChartChange }>();
  /** The charts of this place in their new order. */
  readonly reorder = output<number[]>();
  /** A section's new name, as typed (`from` null: the charts without one). */
  readonly rename = output<{ from: string | null; to: string }>();

  protected readonly chartLabels = CHART_LABELS;
  protected readonly noSection = NO_SECTION;
  protected readonly newSection = NEW_SECTION;

  /** The charts as their page shows them: by section, or one list. */
  private readonly ordered = computed(() => (this.sections() ? sectionsOf(this.items()) : [{ name: null, items: this.items() }]));

  protected readonly groups = computed<Group[]>(() => {
    const byKey = new Map(this.series().map((s) => [s.key, s]));
    const groups = this.ordered();
    return groups.map((group, g) => ({
      name: group.name,
      first: g === 0,
      last: g === groups.length - 1,
      rows: group.items.map((item, i) => ({
        item,
        series: byKey.get(item.metric) ?? null,
        first: i === 0,
        last: i === group.items.length - 1,
      })),
    }));
  });

  /** The sections a chart can move into. */
  protected readonly names = computed(() => this.ordered().flatMap((g) => (g.name === null ? [] : [g.name])));

  /** Moves a chart one place up or down in its section. */
  protected move(group: number, index: number, by: -1 | 1): void {
    const groups = this.ordered().map((g) => [...g.items]);
    const items = groups[group]!;
    [items[index], items[index + by]] = [items[index + by]!, items[index]!];
    this.reorder.emit(groups.flat().map((i) => i.id));
  }

  /** Moves a section, with its charts, before the one above it or after the one below. */
  protected moveSection(group: number, by: -1 | 1): void {
    const groups = this.ordered().map((g) => g.items);
    [groups[group], groups[group + by]] = [groups[group + by]!, groups[group]!];
    this.reorder.emit(groups.flat().map((i) => i.id));
  }

  protected chooseSection(item: ViewItem, choice: SectionChoice): void {
    const section = choice === NO_SECTION ? null : choice === NEW_SECTION ? this.freeName() : (choice as string);
    this.changeChart.emit({ item, change: { section } });
  }

  /** A series chosen: drawn by its first chart, per week (or its own periods), at the end of the last section. */
  protected addChart(event: MatSelectChange): void {
    const series = this.series().find((s) => s.key === event.value);
    event.source.writeValue(null); // the select is an action, not a value
    if (!series) return;
    this.add.emit({
      metric: series.key,
      chart: series.charts[0]!,
      scale: series.scales.length === 0 ? null : series.scales.includes('week') ? 'week' : series.scales[0]!,
      section: this.sections() ? (this.ordered().at(-1)?.name ?? null) : null,
    });
  }

  /** "New section", or "New section 2"…: a name no section has. */
  private freeName(): string {
    const taken = new Set(this.names());
    let name = 'New section';
    for (let n = 2; taken.has(name); n++) name = `New section ${n}`;
    return name;
  }
}
