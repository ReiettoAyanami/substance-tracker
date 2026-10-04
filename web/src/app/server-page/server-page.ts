import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { parseAddress } from '../connection/address';
import { ServerAddress } from '../connection/server-address';
import { ApiError, isUnreachable } from '../data/api-error';
import { VersionApi } from '../data/version-api';
import { Session } from '../session/session';

/** A substance tracker's version (api/src/version.ts, VERSION_FORMAT), as /api/version answers it. */
const TRACKER_VERSION = /^(?:dev|[abv])\d{2}\.\d+\.\d+(?:-[a-z0-9-]+)?$/;

/** What the screen says for each way an address can fail. */
const MESSAGES = {
  empty: 'Type the address of your server.',
  invalid: 'That is not an address: type it as in the browser, e.g. https://tracker.example.com.',
  http:
    'The app talks only https: over http your session would travel in clear, readable by anyone on the same network. ' +
    'Give the server an https address: a reverse proxy with a free certificate (Caddy gets one by itself), or ' +
    'Tailscale, which gives https at home without opening ports.',
  unreachable: 'The server does not answer at this address. Check it, and that the phone can reach it.',
  notTracker: 'Something answers at this address, but it is not a substance tracker.',
} as const;

/**
 * The Android app's first screen (design-android.md, "First launch"): the address of the user's
 * instance. It is kept only once `/api/version` there answers a substance tracker's version; then
 * the website's sign-in page. https only, except in the dev app.
 */
@Component({
  selector: 'app-server-page',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './server-page.html',
  styleUrl: './server-page.css',
})
export class ServerPage {
  private readonly server = inject(ServerAddress);
  private readonly versionApi = inject(VersionApi);
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  protected readonly form = new FormGroup({ address: new FormControl('', { nonNullable: true }) });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async connect(): Promise<void> {
    if (this.busy()) return;
    this.error.set(null);
    const parsed = parseAddress(this.form.controls.address.value, await this.server.allowsHttp());
    if ('problem' in parsed) {
      this.error.set(MESSAGES[parsed.problem]);
      return;
    }
    this.busy.set(true);
    try {
      const answer = await firstValueFrom(this.versionApi.getServerVersion(parsed.address));
      if (!TRACKER_VERSION.test(answer?.version ?? '') || !Number.isInteger(answer?.apiLevel)) {
        this.error.set(MESSAGES.notTracker);
        return;
      }
      this.server.set(parsed.address);
      // Whoever was signed in belonged to no server or to another one.
      this.session.forget();
      await this.router.navigateByUrl('/login');
    } catch (failure) {
      this.error.set(isUnreachable(failure as ApiError) ? MESSAGES.unreachable : MESSAGES.notTracker);
    } finally {
      this.busy.set(false);
    }
  }
}
