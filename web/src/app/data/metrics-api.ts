import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { MetricDefinition, MetricsQuery, MetricsResult, MetricsTable, MetricsTableQuery } from './metric';
import { SeriesData, SeriesDefinition, SeriesQuery } from './series';

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

  /** GET /api/metrics: the catalog, in the order of design-statistics.md, then the series of the charts. */
  getCatalog(): Observable<(MetricDefinition | SeriesDefinition)[]> {
    return this.http.get<(MetricDefinition | SeriesDefinition)[]>('/api/metrics');
  }

  /** GET /api/series: what a chart draws; the substances' ids comma-separated. */
  getSeries({ substanceIds, ...query }: SeriesQuery): Observable<SeriesData> {
    return this.http.get<SeriesData>('/api/series', {
      params: queryOf({ ...query, substanceIds: substanceIds?.length ? substanceIds.join(',') : undefined }),
    });
  }

  /** GET /api/metrics/table: the rows of a table of the metrics page, with the keys asked. */
  getTable({ keys, ...query }: MetricsTableQuery): Observable<MetricsTable> {
    return this.http.get<MetricsTable>('/api/metrics/table', { params: queryOf({ ...query, keys: keys.join(',') }) });
  }

  /** GET /api/batches/:id/metrics: the batch's metrics, over its life, in the scale asked. */
  getBatchMetrics(batchId: number, query: Pick<MetricsQuery, 'per'> = {}): Observable<MetricsResult> {
    return this.http.get<MetricsResult>(`/api/batches/${batchId}/metrics`, { params: queryOf(query) });
  }

  /**
   * GET /api/consumptions/:id/metrics or /api/one-time-consumptions/:id/metrics: a consumption's
   * metrics, of either kind, in the scale asked.
   */
  getConsumptionMetrics(
    type: 'consumption' | 'one_time',
    id: number,
    query: Pick<MetricsQuery, 'per'> = {},
  ): Observable<MetricsResult> {
    const path = type === 'consumption' ? 'consumptions' : 'one-time-consumptions';
    return this.http.get<MetricsResult>(`/api/${path}/${id}/metrics`, { params: queryOf(query) });
  }

  /** GET /api/substances/:id/metrics: the substance's metrics in the scale and the period asked. */
  getSubstanceMetrics(substanceId: number, query: MetricsQuery = {}): Observable<MetricsResult> {
    return this.http.get<MetricsResult>(`/api/substances/${substanceId}/metrics`, { params: queryOf(query) });
  }
}
