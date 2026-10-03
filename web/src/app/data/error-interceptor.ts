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
  type?: string;
  title: string;
  detail: string;
  errors: ApiError['fieldErrors'];
}

function toApiError(response: HttpErrorResponse): ApiError {
  // Status 0: no response at all (API or network down).
  if (response.status === 0) {
    return { status: null, code: null, title: 'Network error', detail: 'The API could not be reached.', fieldErrors: [] };
  }
  const body: unknown = response.error;
  if (isProblemDetails(body)) {
    return { status: response.status, code: codeOf(body.type), title: body.title, detail: body.detail, fieldErrors: body.errors };
  }
  return { status: response.status, code: null, title: response.statusText, detail: '', fieldErrors: [] };
}

/** `urn:substance-tracker:problem:not-found` → `not-found`; `about:blank` or none → null. */
function codeOf(type: string | undefined): string | null {
  const prefix = 'urn:substance-tracker:problem:';
  return type?.startsWith(prefix) ? type.slice(prefix.length) : null;
}

function isProblemDetails(body: unknown): body is ProblemDetails {
  return typeof body === 'object' && body !== null && 'title' in body;
}
