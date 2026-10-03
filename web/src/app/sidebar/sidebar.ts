import { Component, inject, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { IsActiveMatchOptions, Router, RouterLink, RouterLinkActive } from '@angular/router';

import type { ApiError } from '../data/api-error';
import { Session } from '../session/session';

const ROOT: IsActiveMatchOptions = { paths: 'exact', queryParams: 'ignored', matrixParams: 'ignored', fragment: 'ignored' };
const SUBTREE: IsActiveMatchOptions = { paths: 'subset', queryParams: 'ignored', matrixParams: 'ignored', fragment: 'ignored' };

/**
 * The navigation between the pages (design-frontend.md, "sidebar"; design-accounts.md, "Web:
 * /<username>/"): the app's name and the signed-in username, one link per page of the user, the
 * current one highlighted (also on a child route, e.g. a substance's page), then at the bottom,
 * apart from the pages, "Admin" (administrators acting as themselves only), "Sign out" and the
 * settings. The app shell hosts it in a drawer.
 */
@Component({
  selector: 'app-sidebar',
  imports: [MatIconModule, MatListModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  /** A link was tapped (or the user signed out): the shell closes the drawer. */
  readonly navigated = output<void>();

  protected readonly session = inject(Session);
  private readonly router = inject(Router);

  /**
   * The user's pages, under their root. The start page is the root itself: highlighted on the root
   * only (whatever its filter), the others also on their child routes.
   */
  protected readonly pages = [
    { path: '', label: 'Consumptions', icon: 'history', match: ROOT },
    { path: '/substances', label: 'Substances', icon: 'inventory_2', match: SUBTREE },
    { path: '/metrics', label: 'Metrics', icon: 'table_chart', match: SUBTREE },
    { path: '/statistics', label: 'Statistics', icon: 'insights', match: SUBTREE },
  ] as const;
  protected readonly settingsMatch = SUBTREE;

  /** Why the last sign-out did not happen; the drawer stays open to say it. */
  protected readonly signOutError = signal<string | null>(null);

  protected async signOut(): Promise<void> {
    this.signOutError.set(null);
    try {
      await this.session.signOut();
    } catch (error) {
      this.signOutError.set(
        (error as Partial<ApiError> | null)?.status === null
          ? 'Not signed out: the server cannot be reached.'
          : 'Not signed out: try again.',
      );
      return;
    }
    this.navigated.emit();
    await this.router.navigateByUrl('/login');
  }
}
