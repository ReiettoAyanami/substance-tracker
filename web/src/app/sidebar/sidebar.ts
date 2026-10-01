import { Component, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * The navigation between the pages (design-frontend.md, "sidebar"): the app's name and one link
 * per page, the current one highlighted (also on a child route, e.g. a substance's page). Links
 * only, no data. The app shell hosts it in a mat-sidenav and decides whether it is a drawer or
 * stays at the side.
 */
@Component({
  selector: 'app-sidebar',
  imports: [MatIconModule, MatListModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  /** A link was tapped: the shell closes the drawer, when it is one. */
  readonly navigated = output<void>();

  protected readonly pages = [
    { path: '/consumptions', label: 'Consumptions', icon: 'history' },
    { path: '/substances', label: 'Substances', icon: 'inventory_2' },
    { path: '/metrics', label: 'Metrics', icon: 'table_chart' },
    { path: '/statistics', label: 'Statistics', icon: 'insights' },
  ] as const;
}
