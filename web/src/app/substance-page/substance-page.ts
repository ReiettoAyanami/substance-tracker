import { A11yModule } from '@angular/cdk/a11y';
import { DOCUMENT, Location } from '@angular/common';
import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';

import { Substance } from '../data/substance';
import { SubstanceActions } from '../substances-page/substance-actions';
import { SubstanceList } from '../substances-page/substance-list';
import { ChartsPanel } from '../ui/charts-panel/charts-panel';
import { MetricsPanel } from '../ui/metrics-panel/metrics-panel';
import { SubstanceCard } from '../ui/substance-card/substance-card';
import { BatchList } from './batch-list/batch-list';
import { OneTimeList } from './one-time-list/one-time-list';

/** Set by the substances page when it opens this page, so closing can go back instead of stacking a new entry. */
export interface PageHistoryState {
  fromList?: true;
}

/**
 * The substance page (design-frontend.md): child route `:id` of the substances page, a window over
 * the darkened list. It shows the substance's card (with its ⋮ menu), its active batches, its
 * one-time consumptions, its metrics and its charts (design-statistics.md). It reads the substances page's
 * list, so its position and prev/next follow the list order. It closes with X, a tap on the
 * backdrop, Esc or the browser's back (it is a route), and after its substance is deleted. When a
 * batch is added, changed or deleted in its batch list, or a one-time consumption added in its
 * one-time list, the substance is asked again: its card here and in the list underneath show the
 * new numbers, and its metrics and charts are asked again.
 */
@Component({
  selector: 'app-substance-page',
  imports: [A11yModule, BatchList, ChartsPanel, MatButtonModule, MatIconModule, MetricsPanel, OneTimeList, RouterOutlet, SubstanceCard],
  templateUrl: './substance-page.html',
  styleUrl: './substance-page.css',
  host: { '(document:keydown.escape)': 'escape($event)' },
})
export class SubstancePage {
  /** The `:id` of the route. */
  readonly id = input.required<string>();
  private readonly list = inject(SubstanceList);
  protected readonly actions = inject(SubstanceActions);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  /** Its substance was just deleted: the page shows nothing while it closes. */
  private readonly closing = signal(false);
  private readonly location = inject(Location);

  constructor() {
    // The list underneath does not scroll while the window is open.
    const root = inject(DOCUMENT).documentElement;
    root.style.overflow = 'hidden';
    inject(DestroyRef).onDestroy(() => (root.style.overflow = ''));
  }

  protected readonly view = computed(() => {
    const state = this.list.state();
    if (state.status !== 'loaded' || this.closing()) return null;
    const index = state.substances.findIndex((s) => s.id === Number(this.id()));
    if (index < 0) return { found: false } as const;
    return {
      found: true,
      substance: state.substances[index],
      settings: state.settings,
      position: index + 1,
      count: state.substances.length,
      previous: state.substances[index - 1]?.id ?? null,
      next: state.substances[index + 1]?.id ?? null,
    };
  });

  /** A batch or a one-time consumption of the substance was written: its numbers are the API's, so it is asked again. */
  protected reload(id: number): void {
    this.list.reload(id);
  }

  /**
   * Esc closes the page, unless something open over it already took the key: a dialog, a menu, or
   * a batch's page (a child route), which closes first.
   */
  protected escape(event: Event): void {
    if (!event.defaultPrevented && !this.route.firstChild) this.close();
  }

  /** Deleted from the page's card: the page closes onto the list. */
  protected async delete(substance: Substance): Promise<void> {
    if (await this.actions.delete(substance)) {
      this.closing.set(true);
      this.close();
    }
  }

  /**
   * prev/next replace the route: browser back closes the page instead of walking through it. The
   * search of the URL stays: the list underneath, and the order followed, are those it found.
   */
  protected go(id: number): void {
    void this.router.navigate(['/substances', id], {
      replaceUrl: true,
      state: this.historyState(),
      queryParamsHandling: 'preserve',
    });
  }

  /**
   * Opened from the list: back to the list's history entry, as the browser's back would. From a
   * direct link or a refresh there is no such entry: the list replaces the page.
   */
  protected close(): void {
    if (this.historyState().fromList) this.location.back();
    else void this.router.navigate(['/substances'], { replaceUrl: true, queryParamsHandling: 'preserve' });
  }

  private historyState(): PageHistoryState {
    const { fromList } = (this.location.getState() ?? {}) as PageHistoryState;
    return fromList ? { fromList } : {};
  }
}
