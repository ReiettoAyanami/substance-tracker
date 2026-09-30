import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { ApiError } from '../../../data/api-error';
import { ReportsApi } from '../../../data/reports-api';
import { Settings } from '../../../data/settings';
import { Batch } from '../../../data/substance-batches';
import { ConsumptionCard } from '../../../ui/consumption-card/consumption-card';

/** How many consumptions are shown under a batch. */
const RECENT = 5;

/**
 * The last consumptions of a batch, under its sub-card in the batch list (design-frontend.md,
 * "recent consumptions"): five at most, newest first, as compact consumption cards, each with one
 * change from the consumption before it in the batch (the one its list chose). They are only
 * shown here: the item after them, "…", leads to the consumptions page filtered on the batch,
 * where every consumption of it is listed, edited and deleted. Adjustments are never in the list.
 * Loads its data from the API when it is created (its sub-card is opened), and again whenever its
 * batch is (a new price changes the costs).
 */
@Component({
  selector: 'app-recent-consumptions',
  imports: [ConsumptionCard, MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './recent-consumptions.html',
  styleUrl: './recent-consumptions.css',
})
export class RecentConsumptions {
  /** The batch, as its batch list gives it: a new one (the list was asked again) asks the consumptions again. */
  readonly batch = input.required<Batch>();
  /** The substance of the batch, for the link to the consumptions page. */
  readonly substanceId = input.required<number>();
  readonly settings = input.required<Settings>();
  /** The change each card shows, from the previous consumption of the batch: of the quantity, or of the price. */
  readonly deltaOf = input<'quantity' | 'price'>('quantity');

  private readonly reports = inject(ReportsApi);
  private readonly consumptions = rxResource({
    params: () => this.batch(),
    stream: ({ params }) => this.reports.listConsumptions({ batchId: params.id }, { limit: RECENT }),
  });

  /** The consumptions shown; null while loading. A page can exceed its limit (it never splits an instant): five are kept. */
  protected readonly recent = computed(() => (this.consumptions.hasValue() ? this.consumptions.value().slice(0, RECENT) : null));

  /** Why they cannot be shown, if they cannot. */
  protected readonly failure = computed(() => {
    const failure = this.consumptions.error();
    if (!failure) return null;
    // The interceptor's ApiError is not an Error: the resource wraps it, as its cause.
    const error = (failure.cause ?? failure) as Partial<ApiError>;
    return `Could not load the consumptions${error.status ? ` (${error.status})` : ''}`;
  });

  /** The consumptions page with its filters set on this batch (and its substance, as the page would). */
  protected readonly filter = computed(() => ({ substanceId: this.substanceId(), batchId: this.batch().id }));
}
