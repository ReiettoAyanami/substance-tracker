import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import { catchError, defer, from, of } from 'rxjs';

import { APP_VERSION } from '../../app-version';
import { ConfirmDialog, ConfirmDialogData } from '../../confirm-dialog/confirm-dialog';
import { ServerAddress } from '../../connection/server-address';
import { VersionApi } from '../../data/version-api';
import { HistoryDialogs } from '../../history-dialogs';
import { LastData } from '../../last-data/last-data';
import { Session } from '../../session/session';

/**
 * The Settings of the Android app only (design-android.md, "App settings"): its server address and
 * "Change server", its own version and the server's, and for an administrator where administration
 * is (the website: the app has no admin panel).
 */
@Component({
  selector: 'app-app-settings',
  imports: [MatButtonModule],
  templateUrl: './app-settings.html',
  styleUrl: './app-settings.css',
})
export class AppSettings {
  private readonly server = inject(ServerAddress);
  private readonly versionApi = inject(VersionApi);
  private readonly dialogs = inject(HistoryDialogs);
  private readonly router = inject(Router);
  private readonly lastData = inject(LastData);
  protected readonly session = inject(Session);

  protected readonly address = this.server.address;
  protected readonly appVersion = APP_VERSION;
  protected readonly serverVersion = rxResource({ stream: () => this.versionApi.getVersion() });
  protected readonly adminAddress = computed(() => {
    const user = this.session.user();
    return user?.role === 'admin' && !user.impersonatedBy ? `${this.address()}/${user.username}/admin` : null;
  });

  /**
   * Signs out and forgets this server and what the phone keeps of it (its last data), then the
   * server screen. Not reached, the server keeps the session until it expires; the phone forgets it.
   */
  protected async changeServer(): Promise<void> {
    const changed = await this.dialogs.open<ConfirmDialog, ConfirmDialogData, true>(
      ConfirmDialog,
      {
        title: 'Change server?',
        message: 'You will be signed out, and the app forgets this server and the data it kept of it.',
        confirm: 'Change server',
        destructive: false,
        action: () =>
          defer(() => from(this.session.signOut())).pipe(
            catchError(() => {
              this.session.forget();
              return of(undefined);
            }),
          ),
      },
      { width: '400px' },
    );
    if (!changed) return;
    await this.lastData.wipe();
    this.server.clear();
    await this.router.navigateByUrl('/server');
  }
}
