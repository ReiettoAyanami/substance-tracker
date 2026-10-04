import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';

import { ApiError } from './api-error';

/** Where the instance serves the Android app's APK (design-android.md, "/download"). */
export const APK_PATH = '/download/substance.apk';

/** Gateway of the Android app's download: one method per operation, no state, no logic. */
@Injectable({
  providedIn: 'root',
})
export class DownloadApi {
  private readonly http = inject(HttpClient);

  /** HEAD /download/substance.apk: whether this instance carries the APK (404 when its image has none). */
  hasApk(): Observable<boolean> {
    return this.http.head(APK_PATH).pipe(
      map(() => true),
      catchError((error: ApiError) => (error.status === 404 ? of(false) : throwError(() => error))),
    );
  }
}
