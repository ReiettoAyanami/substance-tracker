import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { Subject, debounceTime, map } from 'rxjs';

import { PageHistoryState } from '../substance-page/substance-page';
import { AddButton } from '../ui/add-button/add-button';
import { ChartsPanel } from '../ui/charts-panel/charts-panel';
import { SubstanceCard } from '../ui/substance-card/substance-card';
import { SubstanceActions } from './substance-actions';
import { SubstanceList, searchOf } from './substance-list';
import { SubstancesMetricsPanel } from './substances-metrics-panel/substances-metrics-panel';

/** How long the typing must pause before the search starts (ms). */
const SEARCH_PAUSE = 300;

/** From this width the metrics and the charts of the substances sit at the right of the cards, open. */
export const OVERVIEW_AT_THE_SIDE = '(min-width: 1200px)';

/**
 * The substances page (design-frontend.md, "substances page", the former home): the substance
 * cards in the API's order (name, id) and the "+" that adds a substance or a batch. The list is this
 * template, not a component of its own. It is the parent route of the substance page, which opens
 * in its outlet and shares the list and the actions on a substance (SubstanceList,
 * SubstanceActions, provided here). At the top, the search bar: what is typed goes into the URL
 * (`?q=`) once the typing pauses, in place of the current entry, and the list shows what the API
 * finds by the name of a substance or of one of its batches; a link, a refresh and back keep it.
 * Next to the cards, statistics of the substances in general (lenzi, 2026-10-01): the metrics
 * page's substances table and the charts of this page (surface `substances`, a line per
 * substance), each in its panel. From 1200 px they are a column at the right, open; narrower, they
 * sit between the search and the cards, closed. They do not follow the search.
 */
@Component({
  selector: 'app-substances-page',
  imports: [
    AddButton,
    ChartsPanel,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    RouterOutlet,
    SubstanceCard,
    SubstancesMetricsPanel,
  ],
  providers: [SubstanceList, SubstanceActions],
  templateUrl: './substances-page.html',
  styleUrl: './substances-page.css',
})
export class SubstancesPage {
  protected readonly list = inject(SubstanceList);
  protected readonly actions = inject(SubstanceActions);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** The search of the URL: what the list is asked for. */
  protected readonly query = toSignal(this.route.queryParamMap.pipe(map((query) => searchOf(query.get('q')))), {
    requireSync: true,
  });
  /** What the search field shows: what is typed, or the search of the URL when it comes from elsewhere (a link, back). */
  protected readonly typed = signal('');
  private readonly typing = new Subject<string>();

  /** A wide window: the statistics of the substances at the right, open. */
  protected readonly wide = toSignal(inject(BreakpointObserver).observe(OVERVIEW_AT_THE_SIDE).pipe(map((state) => state.matches)), {
    initialValue: false,
  });

  constructor() {
    effect(() => {
      const query = this.query();
      // what is being typed is left alone: the URL only has it without the blanks around it
      if (query !== searchOf(untracked(this.typed))) this.typed.set(query);
    });
    this.typing.pipe(debounceTime(SEARCH_PAUSE), takeUntilDestroyed()).subscribe((text) => this.find(text));
  }

  /** A key in the search field: the search starts once the typing pauses. */
  protected type(text: string): void {
    this.typed.set(text);
    this.typing.next(text);
  }

  /** The ✕ of the search field: the whole list again, at once. */
  protected clear(): void {
    this.type('');
    this.find('');
  }

  /** The search goes into the URL, which replaces the page's entry: back does not walk through every letter. */
  private find(text: string): void {
    const q = searchOf(text) || null;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { q }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** A tapped card opens its substance page over the list, which stays as it was searched. */
  protected open(substanceId: number): void {
    void this.router.navigate(['/substances', substanceId], {
      state: { fromList: true } satisfies PageHistoryState,
      queryParamsHandling: 'preserve',
    });
  }
}
