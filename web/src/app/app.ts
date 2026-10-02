import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { Sidebar } from './sidebar/sidebar';
import { Appearance } from './ui/appearance';

/** The title of the deepest active route that has one. */
function routeTitle(route: ActivatedRouteSnapshot): string {
  let title = route.title ?? '';
  for (let child = route.firstChild; child; child = child.firstChild) title = child.title ?? title;
  return title;
}

/**
 * App shell (design-frontend.md): the sidebar with the pages, the top bar with the current route's
 * title, and the routes. The sidebar is a drawer on every screen, as on a phone (lenzi, 2026-10-02:
 * "la barra di fianco si apra con un tasto come la versione android"): opened from the top bar,
 * closed after a tap on a link.
 */
@Component({
  selector: 'app-root',
  imports: [MatButtonModule, MatIconModule, MatSidenavModule, MatToolbarModule, RouterOutlet, Sidebar],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly router = inject(Router);

  /** The look this browser chose (Reduce transparency), applied from the first page, not only in /settings. */
  private readonly appearance = inject(Appearance);

  protected readonly title = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => routeTitle(this.router.routerState.snapshot.root)),
    ),
    { initialValue: '' },
  );

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
