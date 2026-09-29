import { A11yModule } from '@angular/cdk/a11y';
import { DOCUMENT, Location } from '@angular/common';
import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

import { Substance } from '../data/substance';
import { SubstanceActions } from '../substances-page/substance-actions';
import { SubstanceList } from '../substances-page/substance-list';
import { SubstanceCard } from '../ui/substance-card/substance-card';
import { BatchList } from './batch-list/batch-list';
import { OneTimeList } from './one-time-list/one-time-list';

/** Set by the substances page when it opens this page, so closing can go back instead of stacking a new entry. */
export interface PageHistoryState {
  fromList?: true;
}

/**
 * The substance page (design-frontend.md): child route `:id` of the substances page, a window over
 * the darkened list. It shows the substance's card (with its ⋮ menu), its active batches and its
 * one-time consumptions. It reads the substances page's list, so its position and prev/next follow
 * the list order. It closes with X, a tap on the backdrop or the browser's back (it is a route), and
 * after its substance is deleted.
 */
@Component({
  selector: 'app-substance-page',
  imports: [A11yModule, BatchList, MatButtonModule, MatIconModule, OneTimeList, SubstanceCard],
  templateUrl: './substance-page.html',
  styleUrl: './substance-page.css',
  host: { '(document:keydown.escape)': 'close()' },
})
export class SubstancePage {
  /** The `:id` of the route. */
  readonly id = input.required<string>();
  private readonly list = inject(SubstanceList);
  protected readonly actions = inject(SubstanceActions);
  private readonly router = inject(Router);
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

  /** Deleted from the page's card: the page closes onto the list. */
  protected async delete(substance: Substance): Promise<void> {
    if (await this.actions.delete(substance)) {
      this.closing.set(true);
      this.close();
    }
  }

  /** prev/next replace the route: browser back closes the page instead of walking through it. */
  protected go(id: number): void {
    void this.router.navigate(['/substances', id], { replaceUrl: true, state: this.historyState() });
  }

  /**
   * Opened from the list: back to the list's history entry, as the browser's back would. From a
   * direct link or a refresh there is no such entry: the list replaces the page.
   */
  protected close(): void {
    if (this.historyState().fromList) this.location.back();
    else void this.router.navigate(['/substances'], { replaceUrl: true });
  }

  private historyState(): PageHistoryState {
    const { fromList } = (this.location.getState() ?? {}) as PageHistoryState;
    return fromList ? { fromList } : {};
  }
}
