import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import { ApiError } from './api-error';

/** Turns every failed response into an ApiError. No retries, no messages shown. */
export const errorInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((error: unknown) =>
      throwError(() => (error instanceof HttpErrorResponse ? toApiError(error) : error)),
    ),
  );

/** The Problem Details body the API sends with every error (design.md, Appendix B). */
interface ProblemDetails {
  title: string;
  detail: string;
  errors: ApiError['fieldErrors'];
}

function toApiError(response: HttpErrorResponse): ApiError {
  // Status 0: no response at all (API or network down).
  if (response.status === 0) {
    return { status: null, title: 'Network error', detail: 'The API could not be reached.', fieldErrors: [] };
  }
  const body: unknown = response.error;
  if (isProblemDetails(body)) {
    return { status: response.status, title: body.title, detail: body.detail, fieldErrors: body.errors };
  }
  return { status: response.status, title: response.statusText, detail: '', fieldErrors: [] };
}

function isProblemDetails(body: unknown): body is ProblemDetails {
  return typeof body === 'object' && body !== null && 'title' in body;
}
