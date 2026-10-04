import { HttpEvent, HttpHeaders, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, from, of, switchMap, tap, throwError } from 'rxjs';

import { RUNS_IN_APP } from '../connection/address';
import { Connectivity } from '../connection/connectivity';
import { ApiError, isUnreachable } from '../data/api-error';
import { Session } from '../session/session';
import { LastData, StoredAnswer } from './last-data';

/** Never kept: the auth routes but the session, and the version (the compatibility check needs the server's own). */
const NOT_KEPT = ['/api/auth/', '/api/version'];

/**
 * Who was signed in, kept once per server (no user is known before it answers): the app opened
 * without network starts with the last user it saw, as it shows the last data it saw. If that
 * session ended meanwhile, the server's first 401 sends to the sign-in page as always.
 */
const SESSION = '/api/auth/get-session';
const SESSION_OWNER = 0;

/** The header a page's answer carries when it comes from the last data: the time the server gave it. */
export const LAST_DATA_AT = 'x-last-data-at';

/** What a read gets offline when the phone has nothing for it (design-android.md, "last data"). */
export const NOT_AVAILABLE_OFFLINE: ApiError = {
  status: null,
  code: 'not-available-offline',
  title: 'Not available offline',
  detail: 'Not available offline',
  fieldErrors: [],
};

/**
 * The Android app's last data and offline state (design-android.md, "last data", "offline"). Every
 * successful read of the API is kept for its server and user; with no answer from the server the read
 * gets the last answer instead, marked with its time, or "Not available offline". While already
 * offline a kept read answers at once from the phone, without waiting for the server again; the
 * Connectivity probe notices when it is back. Any answer of the server ends offline. Outermost: it
 * sees the request as the page made it, and the errors as ApiError. The website is untouched.
 */
export const lastDataInterceptor: HttpInterceptorFn = (req, next) => {
  if (!inject(RUNS_IN_APP) || !req.url.startsWith('/api/')) return next(req);
  const connectivity = inject(Connectivity);
  const lastData = inject(LastData);
  const user = inject(Session).user();
  const isSession = req.method === 'GET' && req.url === SESSION;
  const kept = isSession || (req.method === 'GET' && user !== null && !NOT_KEPT.some((path) => req.url.startsWith(path)));
  const owner = isSession ? SESSION_OWNER : (user?.id ?? SESSION_OWNER);
  const request = req.urlWithParams;

  const fromPhone = (failure: unknown): Observable<HttpEvent<unknown>> =>
    from(lastData.read(owner, request)).pipe(
      switchMap((stored) => {
        if (!stored) {
          if (failure === NOT_AVAILABLE_OFFLINE && !isSession) connectivity.missed();
          return throwError(() => failure);
        }
        if (!isSession) connectivity.showedDataFrom(stored.at);
        return of(answerOf(req, stored));
      }),
    );

  const fromServer = (): Observable<HttpEvent<unknown>> =>
    next(req).pipe(
      tap((event) => {
        if (!(event instanceof HttpResponse)) return;
        connectivity.answered();
        if (kept) void lastData.write(owner, request, event.body, new Date().toISOString());
      }),
      catchError((error: ApiError) => {
        if (!isUnreachable(error)) {
          connectivity.answered();
          return throwError(() => error);
        }
        connectivity.unanswered();
        return kept ? fromPhone(NOT_AVAILABLE_OFFLINE) : throwError(() => error);
      }),
    );

  if (kept && connectivity.offline()) {
    return fromPhone(null).pipe(catchError((nothing) => (nothing === null ? fromServer() : throwError(() => nothing))));
  }
  return fromServer();
};

function answerOf(req: HttpRequest<unknown>, stored: StoredAnswer): HttpResponse<unknown> {
  return new HttpResponse({ body: stored.body, status: 200, url: req.url, headers: new HttpHeaders({ [LAST_DATA_AT]: stored.at }) });
}
