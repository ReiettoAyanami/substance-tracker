import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

/** The title of the deepest active route that has one. */
function routeTitle(route: ActivatedRouteSnapshot): string {
  let title = route.title ?? '';
  for (let child = route.firstChild; child; child = child.firstChild) title = child.title ?? title;
  return title;
}

/** App shell (design-frontend.md): the top bar with the current route's title, and the routes. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatToolbarModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly router = inject(Router);

  protected readonly title = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => routeTitle(this.router.routerState.snapshot.root)),
    ),
    { initialValue: '' },
  );
}
