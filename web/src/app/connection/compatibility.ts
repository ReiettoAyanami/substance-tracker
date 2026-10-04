import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { App } from '@capacitor/app';

import { APP_API_LEVEL, APP_VERSION } from '../app-version';
import { ServerVersion, VersionApi } from '../data/version-api';
import { RUNS_IN_APP } from './address';
import { Connectivity } from './connectivity';
import { ServerAddress } from './server-address';

/**
 * How the Android app stands with its server (design-android.md, "compatibility"):
 * - `same`: same version;
 * - `newer-version`: same API level, another version: a bar says a new version of the app is there;
 * - `app-older`: another API level, the app older: "Update required", a screen that cannot be closed;
 * - `server-older`: another API level, the server older: a screen with the user's two ways out.
 */
export type Standing = 'same' | 'newer-version' | 'app-older' | 'server-older';

/** Two API levels side by side: the app's own, and the server's. */
export function standingOf(server: ServerVersion, app = { version: APP_VERSION, apiLevel: APP_API_LEVEL }): Standing {
  if (server.apiLevel > app.apiLevel) return 'app-older';
  if (server.apiLevel < app.apiLevel) return 'server-older';
  return server.version === app.version ? 'same' : 'newer-version';
}

/**
 * The Android app's compatibility check: `GET /api/version` at launch, at every return to the app and
 * whenever the server answers again; offline nothing is checked and the last standing holds. The key
 * is the API level (`API_LEVEL`), never the version alone: a backend fix changes the version, not the
 * level. While the levels differ the app is stopped, and its queue is not sent.
 */
@Injectable({
  providedIn: 'root',
})
export class Compatibility {
  private readonly versionApi = inject(VersionApi);
  private readonly inApp = inject(RUNS_IN_APP);
  private readonly server = inject(ServerAddress);
  private readonly connectivity = inject(Connectivity);
  private readonly serverVersionState = signal<ServerVersion | null>(null);

  /** The server's version and level, as last answered. */
  readonly serverVersion = this.serverVersionState.asReadonly();
  readonly standing = computed<Standing>(() => {
    const server = this.serverVersionState();
    return server ? standingOf(server) : 'same';
  });
  /** The app cannot work with this server: its pages are covered, its queue waits. */
  readonly blocked = computed(() => this.standing() === 'app-older' || this.standing() === 'server-older');
  readonly appVersion = APP_VERSION;

  constructor() {
    if (!this.inApp) return;
    effect(() => {
      if (this.server.address()) untracked(() => this.check());
      else untracked(() => this.serverVersionState.set(null));
    });
    let wasOffline = false;
    effect(() => {
      const offline = this.connectivity.offline();
      if (wasOffline && !offline) untracked(() => this.check());
      wasOffline = offline;
    });
    const resume = App.addListener('resume', () => this.check());
    inject(DestroyRef).onDestroy(() => void resume.then((handle) => handle.remove()));
  }

  /** Asks the server its version; without an answer the last standing holds. */
  check(): void {
    if (!this.inApp || !this.server.address()) return;
    this.versionApi.getServerVersion().subscribe({
      next: (answer) => {
        if (Number.isInteger(answer?.apiLevel) && typeof answer?.version === 'string') this.serverVersionState.set(answer);
      },
      error: () => undefined,
    });
  }
}
