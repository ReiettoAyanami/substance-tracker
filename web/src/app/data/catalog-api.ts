import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { CreateSubstanceInput, Substance, UpdateSubstanceInput } from './substance';

/** Gateway of the Catalog module: one method per API operation, no state, no logic. */
@Injectable({
  providedIn: 'root',
})
export class CatalogApi {
  private readonly http = inject(HttpClient);

  /**
   * GET /api/substances: ordered by name, then id; archived ones only with `archived: true`; with
   * `q`, only those with that text in their name or in the name of one of their batches.
   */
  listSubstances(options: { archived?: boolean; q?: string } = {}): Observable<Substance[]> {
    const params: Record<string, string | boolean> = {};
    if (options.archived) params['archived'] = true;
    if (options.q) params['q'] = options.q;
    return this.http.get<Substance[]>('/api/substances', { params });
  }

  /** GET /api/substances/:id */
  getSubstance(id: number): Observable<Substance> {
    return this.http.get<Substance>(`/api/substances/${id}`);
  }

  /** POST /api/substances: the created substance, with its summary (201). */
  createSubstance(input: CreateSubstanceInput): Observable<Substance> {
    return this.http.post<Substance>('/api/substances', input);
  }

  /** PATCH /api/substances/:id: the changed substance, with its summary. */
  updateSubstance(id: number, input: UpdateSubstanceInput): Observable<Substance> {
    return this.http.patch<Substance>(`/api/substances/${id}`, input);
  }

  /** DELETE /api/substances/:id (204): soft delete, with everything recorded for the substance. */
  deleteSubstance(id: number): Observable<void> {
    return this.http.delete<void>(`/api/substances/${id}`);
  }
}
