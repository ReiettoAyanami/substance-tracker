import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BatchRecord, CreateBatchInput, UpdateBatchInput } from './batch';
import { ConsumptionRecord, CreateConsumptionInput, UpdateConsumptionInput } from './consumption';
import { CreateOneTimeInput, OneTimeRecord, UpdateOneTimeInput } from './one-time';

/**
 * Gateway of the Ledger module: one method per API operation, no state, no logic. The API refuses
 * what breaks a ledger rule with a 409 (above the remaining, a finished batch): the error
 * interceptor turns it into an ApiError for the caller. Every delete is a soft delete (204).
 */
@Injectable({
  providedIn: 'root',
})
export class LedgerApi {
  private readonly http = inject(HttpClient);

  /** POST /api/substances/:id/batches: the new batch (201). */
  createBatch(substanceId: number, input: CreateBatchInput): Observable<BatchRecord> {
    return this.http.post<BatchRecord>(`/api/substances/${substanceId}/batches`, input);
  }

  /** PATCH /api/batches/:id: the changed batch; 409 once it is finished. */
  updateBatch(id: number, input: UpdateBatchInput): Observable<BatchRecord> {
    return this.http.patch<BatchRecord>(`/api/batches/${id}`, input);
  }

  /** DELETE /api/batches/:id (204); 409 when it is finished or has consumptions or adjustments. */
  deleteBatch(id: number): Observable<void> {
    return this.http.delete<void>(`/api/batches/${id}`);
  }

  /** POST /api/batches/:id/consumptions: the new consumption (201); 409 above the remaining. */
  createConsumption(batchId: number, input: CreateConsumptionInput): Observable<ConsumptionRecord> {
    return this.http.post<ConsumptionRecord>(`/api/batches/${batchId}/consumptions`, input);
  }

  /** PATCH /api/consumptions/:id: the changed consumption (its batch never changes). */
  updateConsumption(id: number, input: UpdateConsumptionInput): Observable<ConsumptionRecord> {
    return this.http.patch<ConsumptionRecord>(`/api/consumptions/${id}`, input);
  }

  /** DELETE /api/consumptions/:id (204): cancelling the one that finished its batch reopens it. */
  deleteConsumption(id: number): Observable<void> {
    return this.http.delete<void>(`/api/consumptions/${id}`);
  }

  /** POST /api/substances/:id/one-time-consumptions: the new one-time consumption (201). */
  createOneTime(substanceId: number, input: CreateOneTimeInput): Observable<OneTimeRecord> {
    return this.http.post<OneTimeRecord>(`/api/substances/${substanceId}/one-time-consumptions`, input);
  }

  /** PATCH /api/one-time-consumptions/:id: the changed one-time consumption. */
  updateOneTime(id: number, input: UpdateOneTimeInput): Observable<OneTimeRecord> {
    return this.http.patch<OneTimeRecord>(`/api/one-time-consumptions/${id}`, input);
  }

  /** DELETE /api/one-time-consumptions/:id (204). */
  deleteOneTime(id: number): Observable<void> {
    return this.http.delete<void>(`/api/one-time-consumptions/${id}`);
  }
}
