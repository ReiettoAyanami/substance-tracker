import { Component, computed, inject, input, output } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';

import { ConsumptionActions } from '../../../consumptions-page/consumption-actions';
import { ApiError } from '../../../data/api-error';
import { Consumption } from '../../../data/consumption';
import { ReportsApi } from '../../../data/reports-api';
import { Settings } from '../../../data/settings';
import { Batch } from '../../../data/substance-batches';
import { Session } from '../../../session/session';
import { ConsumptionCard } from '../../../ui/consumption-card/consumption-card';

/** How many consumptions are shown under a batch. */
const RECENT = 5;

/**
 * The last consumptions of a batch, under its sub-card in the batch list (design-frontend.md,
 * "recent consumptions"): five at most, newest first, as compact consumption cards, each with its
 * change from the consumption before it in the batch (the list is asked by batch). Each card opens
 * its consumption in the consumptions page (its details open there) and has the ⋮ of every card:
 * details, edit, delete (lenzi, 2026-10-03); a change is told to the parent (`changed`), whose
 * numbers move with it. The item after them, "…", leads to the consumptions page filtered on the
 * batch. Adjustments are never in the list. Loads its data from the API when it is created (its
 * sub-card is opened), and again whenever its batch is (a new price changes the costs).
 */
@Component({
  selector: 'app-recent-consumptions',
  imports: [ConsumptionCard, MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './recent-consumptions.html',
  styleUrl: './recent-consumptions.css',
})
export class RecentConsumptions {
  /** The batch, as its list or its page gives it: a new one (asked again) asks the consumptions again. */
  readonly batch = input.required<Pick<Batch, 'id'>>();
  /** The substance of the batch, for the link to the consumptions page. */
  readonly substanceId = input.required<number>();
  readonly settings = input.required<Settings>();
  /** A consumption of the batch was changed or deleted: the batch's numbers changed with it. */
  readonly changed = output<void>();

  private readonly reports = inject(ReportsApi);
  private readonly actions = inject(ConsumptionActions);
  private readonly router = inject(Router);
  protected readonly session = inject(Session);
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

  /** The consumptions page filtered on this batch, with this consumption's details open (`consumption`). */
  protected openInConsumptions(consumption: Consumption): void {
    void this.router.navigate([this.session.path()], { queryParams: { ...this.filter(), consumption: consumption.id } });
  }

  protected details(consumption: Consumption): void {
    void this.actions.details(consumption, this.settings());
  }

  protected async edit(consumption: Consumption): Promise<void> {
    if (await this.actions.edit(consumption)) this.written();
  }

  protected async remove(consumption: Consumption): Promise<void> {
    if (await this.actions.delete(consumption)) this.written();
  }

  private written(): void {
    this.consumptions.reload();
    this.changed.emit();
  }
}
