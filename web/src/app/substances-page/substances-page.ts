import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { PageHistoryState } from '../substance-page/substance-page';
import { AddButton } from '../ui/add-button/add-button';
import { SubstanceCard } from '../ui/substance-card/substance-card';
import { SubstanceActions } from './substance-actions';
import { SubstanceList } from './substance-list';

/**
 * The substances page (design-frontend.md, "substances page", the former home): the substance
 * cards in the API's order (name, id) and the "+" that opens the substance form. The list is this
 * template, not a component of its own. It is the parent route of the substance page, which opens
 * in its outlet and shares the list and the actions on a substance (SubstanceList,
 * SubstanceActions, provided here).
 */
@Component({
  selector: 'app-substances-page',
  imports: [RouterOutlet, AddButton, SubstanceCard],
  providers: [SubstanceList, SubstanceActions],
  templateUrl: './substances-page.html',
  styleUrl: './substances-page.css',
})
export class SubstancesPage {
  protected readonly list = inject(SubstanceList);
  protected readonly actions = inject(SubstanceActions);
  private readonly router = inject(Router);

  /** A tapped card opens its substance page over the list. */
  protected open(substanceId: number): void {
    void this.router.navigate(['/substances', substanceId], { state: { fromList: true } satisfies PageHistoryState });
  }
}
