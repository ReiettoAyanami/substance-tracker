import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { HistoryPage, OneTimeConsumption, OneTimeStats } from './one-time';
import { SubstanceBatches } from './substance-batches';

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

  /** GET /api/substances/:id/one-time: totals and averages of its one-time consumptions. */
  getOneTimeStats(substanceId: number): Observable<OneTimeStats> {
    return this.http.get<OneTimeStats>(`/api/substances/${substanceId}/one-time`);
  }

  /** GET /api/substances/:id/one-time/consumptions: newest first, one page. */
  listOneTimeConsumptions(substanceId: number, page: HistoryPage = {}): Observable<OneTimeConsumption[]> {
    const params: Record<string, string | number> = {};
    if (page.limit !== undefined) params['limit'] = page.limit;
    if (page.before !== undefined) params['before'] = page.before;
    return this.http.get<OneTimeConsumption[]>(`/api/substances/${substanceId}/one-time/consumptions`, { params });
  }
}
