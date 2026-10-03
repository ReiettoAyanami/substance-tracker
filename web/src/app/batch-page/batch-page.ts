import { A11yModule } from '@angular/cdk/a11y';
import { Location } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';

import { ApiError } from '../data/api-error';
import { CatalogApi } from '../data/catalog-api';
import { ReportsApi } from '../data/reports-api';
import { SettingsApi } from '../data/settings-api';
import { LOCALE } from '../locale';
import { Session } from '../session/session';
import { RecentConsumptions } from '../substance-page/batch-list/recent-consumptions/recent-consumptions';
import { PageHistoryState } from '../substance-page/substance-page';
import { IdentityColorPipe } from '../ui/identity-color-pipe';
import { MetricsPanel } from '../ui/metrics-panel/metrics-panel';
import { StockBar } from '../ui/stock-bar/stock-bar';
import { UnitPricePipe } from '../ui/unit-price-pipe';

/** A decimal string of the API, formatted exactly (Intl reads it as a string: no binary rounding). */
const exact = (format: Intl.NumberFormat, value: string) => format.format(value as unknown as number);
const quantityFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 });

/**
 * A batch's page (design-statistics.md, "batch page"): child route `batches/:batchId` of its
 * substance's page, a window over it. What was bought and what is left (its bar, like its
 * sub-card's), its metrics, and its last consumptions. It is opened from the ⋮ of its sub-card
 * ("Details") or from the metrics page, and closes like the substance's page: X, a tap on the
 * backdrop, Esc or the browser's back, going back where it was opened from. It shows only what the
 * API gives; a batch of another substance than the URL's is not found.
 */
@Component({
  selector: 'app-batch-page',
  imports: [A11yModule, IdentityColorPipe, MatButtonModule, MatIconModule, MetricsPanel, RecentConsumptions, StockBar, UnitPricePipe],
  templateUrl: './batch-page.html',
  styleUrl: './batch-page.css',
  host: { '(document:keydown.escape)': 'escape($event)' },
})
export class BatchPage {
  /** The `:batchId` of the route. */
  readonly batchId = input.required<string>();

  private readonly reports = inject(ReportsApi);
  private readonly session = inject(Session);
  private readonly catalog = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly settingsApi = inject(SettingsApi);

  /** The substance of the URL: `/substances/:id/batches/:batchId`. */
  private readonly substanceId = Number(this.route.parent?.snapshot.paramMap.get('id'));

  protected readonly batch = rxResource({
    params: () => Number(this.batchId()),
    stream: ({ params }) => this.reports.getBatch(params),
  });
  protected readonly substance = rxResource({
    params: () => this.substanceId,
    stream: ({ params }) => this.catalog.getSubstance(params),
  });
  protected readonly settings = rxResource({ stream: () => this.settingsApi.getSettings() });

  protected readonly view = computed(() => {
    const failure = this.batch.error() ?? this.substance.error() ?? this.settings.error();
    if (failure) {
      // The interceptor's ApiError is not an Error: the resource wraps it, as its cause.
      const error = (failure.cause ?? failure) as Partial<ApiError>;
      return {
        status: 'missing' as const,
        message: error.status === 404 ? 'Batch not found' : `Could not load the batch${error.status ? ` (${error.status})` : ''}`,
      };
    }
    if (!this.batch.hasValue() || !this.substance.hasValue() || !this.settings.hasValue()) return null;
    const batch = this.batch.value();
    const substance = this.substance.value();
    const settings = this.settings.value();
    if (batch.substanceId !== substance.id) return { status: 'missing' as const, message: 'Batch not found' };
    const unit = substance.unit;
    const money = new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: settings.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const day = new Intl.DateTimeFormat(LOCALE, { timeZone: settings.timezone, day: 'numeric', month: 'short', year: 'numeric' });
    return {
      status: 'found' as const,
      batch,
      substance,
      settings,
      title: batch.name ?? 'Unnamed batch',
      bought: day.format(new Date(batch.occurredAt)),
      quantity: `${exact(quantityFormat, batch.quantity)} ${unit}`,
      totalPrice: exact(money, batch.totalPrice),
      left: batch.deactivatedAt
        ? 'Finished'
        : `${exact(quantityFormat, batch.remaining)} of ${exact(quantityFormat, batch.quantity)} ${unit} left`,
      /** Its own bar: its remaining out of what was bought. */
      segments: [{ batchId: batch.id, name: batch.name, remaining: batch.remaining, unitPrice: batch.unitPrice }],
    };
  });

  /** The batch's page, when it is there. */
  protected readonly found = computed(() => {
    const view = this.view();
    return view?.status === 'found' ? view : null;
  });

  /** Why there is no batch to show, when there is not. */
  protected readonly missing = computed(() => {
    const view = this.view();
    return view?.status === 'missing' ? view.message : null;
  });

  /** Esc closes the page, unless something open over it (a menu of the panel) already took the key. */
  protected escape(event: Event): void {
    if (event.defaultPrevented) return;
    event.preventDefault();
    this.close();
  }

  /**
   * Opened from a list (the batch list, the metrics page): back there, as the browser's back would.
   * From a direct link or a refresh there is no such entry: the substance's page replaces it.
   */
  protected close(): void {
    const { fromList } = (this.location.getState() ?? {}) as PageHistoryState;
    if (fromList) this.location.back();
    else void this.router.navigate([this.session.path('/substances'), this.substanceId], { replaceUrl: true, queryParamsHandling: 'preserve' });
  }
}
