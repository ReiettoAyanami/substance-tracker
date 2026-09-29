import { BreakpointObserver } from '@angular/cdk/layout';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatSidenav } from '@angular/material/sidenav';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  /** The app on a wide screen (the sidebar at the side) or a narrow one (a drawer). */
  async function start(screen: 'wide' | 'narrow', url = '/') {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes),
        // jsdom has no animation events: the drawer opens and closes at once
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: BreakpointObserver, useValue: { observe: () => of({ matches: screen === 'wide', breakpoints: {} }) } },
      ],
    });
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      element,
      sidebar: fixture.debugElement.query(By.directive(MatSidenav)).componentInstance as MatSidenav,
      title: () => element.querySelector('mat-toolbar .title')?.textContent?.trim(),
      menuButton: () => element.querySelector<HTMLButtonElement>('mat-toolbar button[aria-label="Menu"]'),
      link: (label: string) =>
        Array.from(element.querySelectorAll<HTMLAnchorElement>('app-sidebar a')).find((a) => a.textContent?.includes(label))!,
    };
  }

  it('opens on Consumptions, with its title in the top bar', async () => {
    const app = await start('narrow');

    expect(TestBed.inject(Router).url).toBe('/consumptions');
    expect(app.title()).toBe('Consumptions');
    expect(app.element.querySelector('app-consumptions-page')).not.toBeNull();
  });

  it('shows the substances page under /substances, and sends an unknown URL to Consumptions', async () => {
    const app = await start('narrow', '/substances');
    expect(app.title()).toBe('Substances');
    expect(app.element.querySelector('app-substances-page')).not.toBeNull();

    await TestBed.inject(Router).navigateByUrl('/no-such-page');
    await app.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/consumptions');
  });

  it('on a narrow screen: a drawer opened from the top bar, closed after a tap on a link', async () => {
    const app = await start('narrow');
    expect(app.sidebar.mode).toBe('over');
    expect(app.sidebar.opened).toBe(false);

    app.menuButton()!.click();
    await app.fixture.whenStable();
    expect(app.sidebar.opened).toBe(true);

    app.link('Substances').click();
    await app.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/substances');
    expect(app.title()).toBe('Substances');
    expect(app.sidebar.opened).toBe(false);
  });

  it('on a wide screen: the sidebar stays open at the side, with no menu button', async () => {
    const app = await start('wide');
    expect(app.sidebar.mode).toBe('side');
    expect(app.sidebar.opened).toBe(true);
    expect(app.menuButton()).toBeNull();
    // the room it takes, for the windows centred over the content (the substance page)
    const container = app.element.querySelector<HTMLElement>('mat-sidenav-container')!;
    expect(container.style.getPropertyValue('--app-sidebar-width')).toBe('240px');

    app.link('Substances').click();
    await app.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/substances');
    expect(app.sidebar.opened).toBe(true);
  });
});
