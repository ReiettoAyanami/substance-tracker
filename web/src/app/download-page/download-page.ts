import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { APK_PATH, DownloadApi } from '../data/download-api';
import { VersionApi } from '../data/version-api';

/** The project's releases on GitHub, where every final version's APK is attached (ci.yml). */
const RELEASES = 'https://github.com/ReiettoAyanami/substance-tracker/releases/tag/';

/**
 * The instance's public download page (design-android.md, "/download"): no sign-in, because the
 * APK is needed before signing in on the phone. It offers the APK of the instance's own version, or,
 * when the image carries none (built without the CI), the GitHub Release of the same version; and it
 * says how to install an APK from outside the Play Store and which address to give the app.
 */
@Component({
  selector: 'app-download-page',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './download-page.html',
  styleUrl: './download-page.css',
})
export class DownloadPage {
  private readonly downloadApi = inject(DownloadApi);
  private readonly versionApi = inject(VersionApi);

  protected readonly apkPath = APK_PATH;
  protected readonly version = rxResource({ stream: () => this.versionApi.getVersion() });
  protected readonly hasApk = rxResource({ stream: () => this.downloadApi.hasApk() });
  /** The address the app asks for at its first launch: this instance's. */
  protected readonly address = location.origin;
  protected readonly secure = location.protocol === 'https:';

  /** The GitHub Release of a final version (a, b, v); a development version has none. */
  protected releaseOf(version: string): string | null {
    return /^[abv]\d/.test(version) ? RELEASES + version : null;
  }
}
