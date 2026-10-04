import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { Compatibility } from '../../connection/compatibility';
import { ServerAddress } from '../../connection/server-address';

/**
 * What the Android app says when it and its server differ (design-android.md, "compatibility"): a
 * bar "A new version of the app is available" for another version at the same API level; for another
 * API level a screen over everything that cannot be closed: "Update required" (the app older), or the
 * server older, with the two ways out a user has. The download is the server's `/download`, which
 * the phone opens in its browser.
 */
@Component({
  selector: 'app-update-notice',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './update-notice.html',
  styleUrl: './update-notice.css',
})
export class UpdateNotice {
  private readonly compatibility = inject(Compatibility);
  private readonly server = inject(ServerAddress);

  protected readonly standing = this.compatibility.standing;
  protected readonly appVersion = this.compatibility.appVersion;
  protected readonly serverVersion = computed(() => this.compatibility.serverVersion()?.version ?? '');
  protected readonly download = computed(() => `${this.server.address() ?? ''}/download`);
}
