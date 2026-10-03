import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthApi, type SessionUser } from '../data/auth-api';

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
  private readonly current = signal<SessionUser | null>(null);
  private loading: Promise<SessionUser | null> | null = null;

  readonly user = this.current.asReadonly();

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

  /** Signs in, then asks who it is now. Rejects with the ApiError of a refused sign-in. */
  async signIn(username: string, password: string): Promise<SessionUser | null> {
    await firstValueFrom(this.authApi.signIn(username, password));
    this.loading = null;
    return this.load();
  }

  /**
   * Signs out. When the server did not end the session (no connection), it rejects and the user
   * stays signed in here too: the session is still alive, so saying otherwise would lie.
   */
  async signOut(): Promise<void> {
    await firstValueFrom(this.authApi.signOut());
    this.forget();
  }

  /** The session is over (signed out, or an API call answered 401): forget it. */
  forget(): void {
    this.current.set(null);
    this.loading = null;
  }
}
