import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

/** Gateway of the product's version: one method per API operation, no state, no logic. */
@Injectable({
  providedIn: 'root',
})
export class VersionApi {
  private readonly http = inject(HttpClient);

  /** GET /api/version: the version of the running instance, e.g. "dev26.0.0". */
  getVersion(): Observable<string> {
    return this.http.get<{ version: string }>('/api/version').pipe(map((body) => body.version));
  }
}
