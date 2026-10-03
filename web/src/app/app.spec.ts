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
import { AdminApi } from './data/admin-api';
import { AuthApi, type SessionUser } from './data/auth-api';
import { CatalogApi } from './data/catalog-api';
import { MetricsApi } from './data/metrics-api';
import { ReportsApi } from './data/reports-api';
import { SettingsApi } from './data/settings-api';
import { VersionApi } from './data/version-api';
import { ViewsApi } from './data/views-api';

const lenzi: SessionUser = { id: 1, username: 'lenzi', role: 'admin', impersonatedBy: null };

/** The pages' data: the shell is tested here, not what the pages show. */
function pageData(listConsumptions: () => unknown) {
  return [
    {
      provide: ReportsApi,
      useValue: {
        listConsumptions,
        listBatches: () => of([]),
        getConsumptionBounds: () => of({ minCost: null, maxCost: null, minQuantity: null, maxQuantity: null }),
      },
    },
    { provide: CatalogApi, useValue: { listSubstances: () => of([]) } },
    // the statistics of the substances page, open on a wide screen
    {
      provide: MetricsApi,
      useValue: {
        getCatalog: () => of([]),
        getTable: () => of({ scope: 'substance', per: 'day', from: null, to: null, keys: [], rows: [] }),
      },
    },
    { provide: ViewsApi, useValue: { list: () => of([]) } },
    {
      provide: SettingsApi,
      useValue: { getSettings: () => of({ timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' }) },
    },
    // the shell's own: the version in the corner
    { provide: VersionApi, useValue: { getVersion: () => of('dev26.0.0') } },
    // the admin view
    { provide: AdminApi, useValue: { listUsers: () => of([]) } },
  ];
}

describe('App', () => {
  /** The app at `url`, with `user` signed in (null: nobody). */
  async function start(url = '/', user: SessionUser | null = lenzi) {
    let session = user;
    const listConsumptions = vi.fn(() => of([]));
    const signOut = vi.fn(() => {
      session = null;
      return of(undefined);
    });
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes),
        // jsdom has no animation events: the drawer opens and closes at once
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: AuthApi, useValue: { getSession: () => of(session), signOut } },
        ...pageData(listConsumptions),
      ],
    });
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      element,
      router,
      listConsumptions,
      signOut,
      go: async (to: string) => {
        await router.navigateByUrl(to);
        await fixture.whenStable();
      },
      sidebar: fixture.debugElement.query(By.directive(MatSidenav)).componentInstance as MatSidenav,
      title: () => element.querySelector('mat-toolbar .title')?.textContent?.trim(),
      menuButton: () => element.querySelector<HTMLButtonElement>('mat-toolbar button[aria-label="Menu"]'),
      link: (label: string) =>
        Array.from(element.querySelectorAll<HTMLElement>('app-sidebar [mat-list-item]')).find((a) => a.textContent?.includes(label))!,
    };
  }

  it("opens on the signed-in user's consumptions, under their username, with its title in the top bar", async () => {
    const app = await start();

    expect(app.router.url).toBe('/lenzi');
    expect(app.title()).toBe('Consumptions');
    expect(app.element.querySelector('app-consumptions-page')).not.toBeNull();
    // the page is made once: hiding or showing the app around it does not make it again
    expect(app.listConsumptions).toHaveBeenCalledTimes(1);
    // the instance's version, in the corner
    app.fixture.detectChanges();
    expect(app.element.querySelector('app-version-label')?.textContent?.trim()).toBe('dev26.0.0');
  });

  it('starts with the transparency this browser chose: reduced, the windows are solid from the first page', async () => {
    localStorage.setItem('substance-tracker.reduce-transparency', 'true');
    document.documentElement.classList.remove('reduce-transparency');
    await start();

    expect(document.documentElement.classList.contains('reduce-transparency')).toBe(true);
    localStorage.removeItem('substance-tracker.reduce-transparency');
    document.documentElement.classList.remove('reduce-transparency');
  });

  it('shows the pages under the username; an unknown page, an old address, another user all get the same 404', async () => {
    const app = await start('/lenzi/substances');
    expect(app.title()).toBe('Substances');
    expect(app.element.querySelector('app-substances-page')).not.toBeNull();

    for (const url of ['/lenzi/no-such-page', '/consumptions', '/substances/5', '/other-user', '/other-user/substances']) {
      await app.go(url);
      expect(app.router.url).toBe(url);
      expect(app.element.querySelector('app-not-found-page')).not.toBeNull();
      expect(app.title()).toBe('Not found');
      // the way out: one's own start page
      expect(app.element.querySelector('app-not-found-page a')?.getAttribute('href')).toBe('/lenzi');
    }
  });

  it('signed out, a page asks to sign in first and keeps the address; the sign-in page stands alone', async () => {
    const app = await start('/lenzi/metrics', null);

    expect(app.router.url).toBe('/login?next=%2Flenzi%2Fmetrics');
    expect(app.element.querySelector('app-login-page')).not.toBeNull();
    expect(app.element.querySelector('mat-toolbar')).toBeNull();
    expect(app.element.querySelector('app-sidebar')).toBeNull();

    // whatever the username: nothing tells whether it exists
    await app.go('/other-user');
    expect(app.router.url).toBe('/login?next=%2Fother-user');
    await app.go('/');
    expect(app.router.url).toBe('/login');
  });

  it('signed in, the sign-in page sends the user to their own pages', async () => {
    const app = await start('/login');
    expect(app.router.url).toBe('/lenzi');
  });

  it('the sidebar is a drawer on every screen, as on a phone: opened from the top bar, closed after a tap on a link', async () => {
    const app = await start();
    expect(app.sidebar.mode).toBe('over');
    expect(app.sidebar.opened).toBe(false);

    app.menuButton()!.click();
    await app.fixture.whenStable();
    expect(app.sidebar.opened).toBe(true);

    app.link('Substances').click();
    await app.fixture.whenStable();
    expect(app.router.url).toBe('/lenzi/substances');
    expect(app.title()).toBe('Substances');
    expect(app.sidebar.opened).toBe(false);
  });

  it('/admin: the admin view in the app for an administrator; for a user, the 404 page', async () => {
    const app = await start('/admin');
    expect(app.router.url).toBe('/admin');
    expect(app.title()).toBe('Admin');
    expect(app.element.querySelector('app-admin-page')).not.toBeNull();
    TestBed.resetTestingModule();

    const user = await start('/admin', { id: 2, username: 'friend', role: 'user', impersonatedBy: null });
    expect(user.router.url).toBe('/admin');
    expect(user.element.querySelector('app-not-found-page')).not.toBeNull();
  });

  it('an administrator acting as a user: the "Viewing as" bar above the top bar, no admin view', async () => {
    const app = await start('/friend', { id: 7, username: 'friend', role: 'user', impersonatedBy: 1 });

    expect(app.element.querySelector('app-viewing-as-bar')?.textContent).toContain('Viewing as friend');
    const bar = app.element.querySelector('app-viewing-as-bar')!;
    expect(bar.compareDocumentPosition(app.element.querySelector('mat-toolbar')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await app.go('/admin');
    expect(app.element.querySelector('app-not-found-page')).not.toBeNull();
  });

  it('nobody impersonated: no bar', async () => {
    const app = await start();
    expect(app.element.querySelector('app-viewing-as-bar')).toBeNull();
  });

  it('signs out from the sidebar: the session ends and the sign-in page stands alone', async () => {
    const app = await start('/lenzi/metrics');
    app.menuButton()!.click();
    await app.fixture.whenStable();

    app.link('Sign out').click();
    await app.fixture.whenStable();

    expect(app.signOut).toHaveBeenCalledTimes(1);
    expect(app.router.url).toBe('/login');
    expect(app.sidebar.opened).toBe(false);
    expect(app.element.querySelector('app-login-page')).not.toBeNull();
    expect(app.element.querySelector('mat-toolbar')).toBeNull();
  });
});
