import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { MetricDefinition, MetricsQuery, MetricsResult, MetricsTable, MetricsTableQuery } from './metric';

/** The query parameters that are set: an unset one is left out. */
function queryOf(values: object): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) params[key] = value as string | number;
  }
  return params;
}

/** Gateway of the Metrics part of Reports: one method per API operation, no state, no logic. */
@Injectable({
  providedIn: 'root',
})
export class MetricsApi {
  private readonly http = inject(HttpClient);

  /** GET /api/metrics: the catalog, in the order of design-statistics.md. */
  getCatalog(): Observable<MetricDefinition[]> {
    return this.http.get<MetricDefinition[]>('/api/metrics');
  }

  /** GET /api/metrics/table: the rows of a table of the metrics page, with the keys asked. */
  getTable({ keys, ...query }: MetricsTableQuery): Observable<MetricsTable> {
    return this.http.get<MetricsTable>('/api/metrics/table', { params: queryOf({ ...query, keys: keys.join(',') }) });
  }

  /** GET /api/substances/:id/metrics: the substance's metrics in the scale and the period asked. */
  getSubstanceMetrics(substanceId: number, query: MetricsQuery = {}): Observable<MetricsResult> {
    return this.http.get<MetricsResult>(`/api/substances/${substanceId}/metrics`, { params: queryOf(query) });
  }
}
