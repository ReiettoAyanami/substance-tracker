import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Settings } from './settings';

/** Gateway of the Settings module: one method per API operation, no state, no logic. */
@Injectable({
  providedIn: 'root',
})
export class SettingsApi {
  private readonly http = inject(HttpClient);

  /** GET /api/settings */
  getSettings(): Observable<Settings> {
    return this.http.get<Settings>('/api/settings');
  }
}
