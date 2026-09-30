import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';

import { MetricDefinition } from '../../data/metric';
import { ViewItem } from '../../data/view-item';

/** An item and the metric it shows. */
interface Row {
  item: ViewItem;
  metric: MetricDefinition | null;
  first: boolean;
  last: boolean;
}

/**
 * What one place shows (a panel, a table of the metrics page), as an editable list: each metric
 * with its description, moved up or down, or removed; below, the metrics it could add, each with
 * its description. It only asks: its page writes, and gives it the new list.
 */
@Component({
  selector: 'app-view-item-list',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatSelectModule],
  templateUrl: './view-item-list.html',
  styleUrl: './view-item-list.css',
})
export class ViewItemList {
  /** The items of this place, in order. */
  readonly items = input.required<ViewItem[]>();
  /** The metrics this place can show (of its scope), in the catalog's order. */
  readonly metrics = input.required<MetricDefinition[]>();
  /** A write is running: nothing more is asked until it ends. */
  readonly busy = input(false);

  readonly add = output<string>();
  readonly remove = output<ViewItem>();
  /** Move an item one place up (-1) or down (+1). */
  readonly move = output<{ item: ViewItem; by: -1 | 1 }>();

  protected readonly rows = computed<Row[]>(() => {
    const byKey = new Map(this.metrics().map((m) => [m.key, m]));
    const items = this.items();
    return items.map((item, i) => ({ item, metric: byKey.get(item.metric) ?? null, first: i === 0, last: i === items.length - 1 }));
  });

  /** What can still be added: the metrics of the scope it does not show yet. */
  protected readonly addable = computed(() => {
    const shown = new Set(this.items().map((i) => i.metric));
    return this.metrics().filter((m) => !shown.has(m.key));
  });
}
