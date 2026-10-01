import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ChartChange, NewViewItem, Surface, ViewItem } from './view-item';

/** Gateway of the Views module: one method per API operation, no state, no logic. */
@Injectable({
  providedIn: 'root',
})
export class ViewsApi {
  private readonly http = inject(HttpClient);

  /** GET /api/view-items: what a surface shows, in order. */
  list(surface: Surface): Observable<ViewItem[]> {
    return this.http.get<ViewItem[]>('/api/view-items', { params: { surface } });
  }

  /** POST /api/view-items: one more thing at the end of its surface. */
  add(item: NewViewItem): Observable<ViewItem> {
    return this.http.post<ViewItem>('/api/view-items', item);
  }

  /** PATCH /api/view-items/:id: a chart drawn another way, in another scale or (statistics page) section. */
  change(id: number, change: ChartChange): Observable<ViewItem> {
    return this.http.patch<ViewItem>(`/api/view-items/${id}`, change);
  }

  /** PATCH /api/view-items/sections: a section of the statistics page renamed (null: the charts without one; blank: none). */
  renameSection(from: string | null, to: string | null): Observable<ViewItem[]> {
    return this.http.patch<ViewItem[]>('/api/view-items/sections', { from, to });
  }

  /** DELETE /api/view-items/:id (a soft delete). */
  remove(id: number): Observable<void> {
    return this.http.delete<void>(`/api/view-items/${id}`);
  }

  /** PUT /api/view-items/order: the surface in the order of `ids` (every item of it, each once). */
  reorder(surface: Surface, ids: number[]): Observable<ViewItem[]> {
    return this.http.put<ViewItem[]>('/api/view-items/order', { surface, ids });
  }
}
