import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BatchDetails, BatchListItem } from './batch';
import { Consumption, ConsumptionBounds, ConsumptionFilter, ConsumptionScope } from './consumption';
import { HistoryPage, OneTimeConsumption, OneTimeStats } from './one-time';
import { SubstanceBatches } from './substance-batches';

/** The query parameters that are set, in the order given: an unset filter is left out. */
function queryOf(values: object): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) params[key] = value as string | number;
  }
  return params;
}

/** Gateway of the Reports module: one method per API operation, no state, no logic. */
@Injectable({
  providedIn: 'root',
})
export class ReportsApi {
  private readonly http = inject(HttpClient);

  /** GET /api/substances/:id/batches: the active batches, oldest first, with their shares. */
  getSubstanceBatches(substanceId: number): Observable<SubstanceBatches> {
    return this.http.get<SubstanceBatches>(`/api/substances/${substanceId}/batches`);
  }

  /** GET /api/batches/:id: one batch, finished or not, with its remaining and unit price. */
  getBatch(batchId: number): Observable<BatchDetails> {
    return this.http.get<BatchDetails>(`/api/batches/${batchId}`);
  }

  /** GET /api/substances/:id/one-time: totals and averages of its one-time consumptions. */
  getOneTimeStats(substanceId: number): Observable<OneTimeStats> {
    return this.http.get<OneTimeStats>(`/api/substances/${substanceId}/one-time`);
  }

  /** GET /api/substances/:id/one-time/consumptions: newest first, one page. */
  listOneTimeConsumptions(substanceId: number, page: HistoryPage = {}): Observable<OneTimeConsumption[]> {
    return this.http.get<OneTimeConsumption[]>(`/api/substances/${substanceId}/one-time/consumptions`, {
      params: queryOf(page),
    });
  }

  /**
   * GET /api/consumptions: batch and one-time consumptions, newest first, one page, with the unit
   * price, the cost and the delta from the previous one computed by the API.
   */
  listConsumptions(filter: ConsumptionFilter = {}, page: HistoryPage = {}): Observable<Consumption[]> {
    return this.http.get<Consumption[]>('/api/consumptions', { params: queryOf({ ...filter, ...page }) });
  }

  /** GET /api/consumptions/bounds: the ends of the unit price and quantity sliders of a scope. */
  getConsumptionBounds(scope: ConsumptionScope = {}): Observable<ConsumptionBounds> {
    return this.http.get<ConsumptionBounds>('/api/consumptions/bounds', { params: queryOf(scope) });
  }

  /** GET /api/batches: every batch not deleted, finished ones too, by substance, newest first. */
  listBatches(filter: { substanceId?: number } = {}): Observable<BatchListItem[]> {
    return this.http.get<BatchListItem[]>('/api/batches', { params: queryOf(filter) });
  }
}
