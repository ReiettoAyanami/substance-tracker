import { Component, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { RUNS_IN_APP } from './connection/address';
import { Connectivity } from './connection/connectivity';
import { LastData } from './last-data/last-data';
import { Session } from './session/session';
import { Sidebar } from './sidebar/sidebar';
import { Appearance } from './ui/appearance';
import { OfflineBar } from './ui/offline-bar/offline-bar';
import { UpdateNotice } from './ui/update-notice/update-notice';
import { VersionLabel } from './ui/version-label/version-label';
import { ViewingAsBar } from './ui/viewing-as-bar/viewing-as-bar';

/** The title of the deepest active route that has one. */
function routeTitle(route: ActivatedRouteSnapshot): string {
  let title = route.title ?? '';
  for (let child = route.firstChild; child; child = child.firstChild) title = child.title ?? title;
  return title;
}

/** Does the active route ask to be shown alone, without the app around it (the sign-in page)? */
function routeIsBare(route: ActivatedRouteSnapshot): boolean {
  for (let current: ActivatedRouteSnapshot | null = route; current; current = current.firstChild) {
    if (current.data['bare'] === true) return true;
  }
  return false;
}

/**
 * App shell (design-frontend.md): the sidebar with the pages, the top bar with the current route's
 * title, and the routes. The sidebar is a drawer on every screen, as on a phone (lenzi, 2026-10-02:
 * "la barra di fianco si apra con un tasto come la versione android"): opened from the top bar,
 * closed after a tap on a link. Without a signed-in user (the sign-in page, a 404 seen signed out)
 * the page stands alone: there are no pages to link to.
 */
@Component({
  selector: 'app-root',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatToolbarModule,
    OfflineBar,
    RouterOutlet,
    Sidebar,
    UpdateNotice,
    VersionLabel,
    ViewingAsBar,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly router = inject(Router);
  private readonly session = inject(Session);

  /** The look this browser chose (Reduce transparency), applied from the first page, not only in /settings. */
  private readonly appearance = inject(Appearance);

  private readonly navigated$ = this.router.events.pipe(filter((event) => event instanceof NavigationEnd));

  protected readonly title = toSignal(this.navigated$.pipe(map(() => routeTitle(this.router.routerState.snapshot.root))), {
    initialValue: '',
  });

  /**
   * Decided when a navigation ends, not as soon as the session changes: signing out keeps the app
   * around the page until the sign-in page is there.
   */
  protected readonly bare = toSignal(
    this.navigated$.pipe(map(() => routeIsBare(this.router.routerState.snapshot.root) || this.session.user() === null)),
    { initialValue: true },
  );

  /** The Android app without an answer from its server (design-android.md, "offline"). */
  protected readonly offline = inject(Connectivity).offline;
  protected readonly inApp = inject(RUNS_IN_APP);

  /** An administrator is acting as this user (design-accounts.md, "impersonation"). */
  protected readonly impersonating = computed(() => (this.session.user()?.impersonatedBy ?? null) !== null);

  constructor() {
    // The Android app, signed in: what recording a consumption offline needs, once per user and launch.
    if (inject(RUNS_IN_APP)) {
      const lastData = inject(LastData);
      let refreshedFor: number | null = null;
      effect(() => {
        const user = this.session.user();
        if (!user || user.id === refreshedFor) return;
        refreshedFor = user.id;
        untracked(() => void lastData.refreshForOffline());
      });
    }
  }

  /**
   * The menu button opens the drawer. Its origin goes with it: closing gives the focus back to the
   * button, with a focus ring only when the drawer was opened from the keyboard (a click from a
   * keyboard has detail 0).
   */
  protected openSidebar(sidebar: MatSidenav, click: MouseEvent): void {
    void sidebar.open(click.detail === 0 ? 'keyboard' : 'mouse');
  }

  /** A link of the sidebar was tapped: the drawer closes. */
  protected navigated(sidebar: MatSidenav): void {
    void sidebar.close();
  }
}
