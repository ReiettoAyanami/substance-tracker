import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { ServerAddress } from '../../connection/server-address';
import { VersionApi } from '../../data/version-api';

/**
 * The instance's version in the bottom right corner of every page (lenzi, 2026-10-03: "metti in
 * basso la sottoversione in basso a destra"), small and faint, under the "+" and the windows, never
 * in the way of a tap. The API says which version runs (api/src/version.ts); nothing shows until it
 * answers, nor if it does not. In the Android app it asks again once a server address is chosen.
 */
@Component({
  selector: 'app-version-label',
  imports: [],
  templateUrl: './version-label.html',
  styleUrl: './version-label.css',
})
export class VersionLabel {
  private readonly versionApi = inject(VersionApi);
  private readonly server = inject(ServerAddress);

  protected readonly version = rxResource({
    params: () => ({ server: this.server.address() }),
    stream: () => this.versionApi.getVersion(),
  });
}
