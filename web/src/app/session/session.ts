import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthApi, type SessionUser } from '../data/auth-api';
import { RUNS_IN_APP } from '../connection/address';
import { LastData } from '../last-data/last-data';

/**
 * Who is signed in (design-accounts.md, "session"): the server decides, this only remembers what it
 * said. The guards wait for `load()` before showing any page of a user, so on those pages `user()`
 * is always there.
 */
@Injectable({
  providedIn: 'root',
})
export class Session {
  private readonly authApi = inject(AuthApi);
  private readonly inApp = inject(RUNS_IN_APP);
  private readonly lastData = inject(LastData);
  private readonly current = signal<SessionUser | null>(null);
  private loading: Promise<SessionUser | null> | null = null;

  readonly user = this.current.asReadonly();

  /**
   * The admin view is for an administrator acting as itself: not during an impersonation, even of
   * another administrator (design-accounts.md, "impersonation"), and never in the Android app, whose
   * administration stays on the website (design-android.md, "app").
   */
  readonly canAdminister = computed(() => {
    const user = this.current();
    return !this.inApp && user?.role === 'admin' && user.impersonatedBy === null;
  });

  /**
   * The address of one of the user's pages (design-accounts.md, "Web: /<username>/"): `path()` is
   * the start page, `/lenzi`; `path('/metrics')` is `/lenzi/metrics`. Every link to a page of the
   * user is built here. Without a user (component tests) the pages sit at the root.
   */
  path(page = ''): string {
    const user = this.current();
    return ((user ? `/${user.username}` : '') + page) || '/';
  }

  /** Asks the server once who this browser is; later calls get the same answer. */
  load(): Promise<SessionUser | null> {
    this.loading ??= firstValueFrom(this.authApi.getSession()).then(
      (user) => {
        this.current.set(user);
        return user;
      },
      () => {
        // No answer (network): ask again next time.
        this.loading = null;
        return null;
      },
    );
    return this.loading;
  }

  /** Asks the server again who this browser is: after signing in, after an impersonation starts or ends. */
  reload(): Promise<SessionUser | null> {
    this.loading = null;
    return this.load();
  }

  /** Signs in, then asks who it is now. Rejects with the ApiError of a refused sign-in. */
  async signIn(username: string, password: string): Promise<SessionUser | null> {
    await firstValueFrom(this.authApi.signIn(username, password));
    return this.reload();
  }

  /**
   * Signs out. When the server did not end the session (no connection), it rejects and the user
   * stays signed in here too: the session is still alive, so saying otherwise would lie. In the
   * Android app the phone's last data are wiped; a 401 (forget) keeps them, bound to their user.
   */
  async signOut(): Promise<void> {
    await firstValueFrom(this.authApi.signOut());
    this.forget();
    // The Android app's last data go with the session (design-android.md, "last data").
    await this.lastData.wipe();
  }

  /** The session is over (signed out, or an API call answered 401): forget it. */
  forget(): void {
    this.current.set(null);
    this.loading = null;
  }
}
