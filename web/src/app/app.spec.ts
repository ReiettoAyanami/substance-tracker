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
import { CatalogApi } from './data/catalog-api';
import { MetricsApi } from './data/metrics-api';
import { ReportsApi } from './data/reports-api';
import { SettingsApi } from './data/settings-api';
import { VersionApi } from './data/version-api';
import { ViewsApi } from './data/views-api';

/** The pages' data: the shell is tested here, not what the pages show. */
const pageData = [
  {
    provide: ReportsApi,
    useValue: {
      listConsumptions: () => of([]),
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
];

describe('App', () => {
  async function start(url = '/') {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes),
        // jsdom has no animation events: the drawer opens and closes at once
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        ...pageData,
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
    const app = await start();

    expect(TestBed.inject(Router).url).toBe('/consumptions');
    expect(app.title()).toBe('Consumptions');
    expect(app.element.querySelector('app-consumptions-page')).not.toBeNull();
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

  it('shows the substances page under /substances, and sends an unknown URL to Consumptions', async () => {
    const app = await start('/substances');
    expect(app.title()).toBe('Substances');
    expect(app.element.querySelector('app-substances-page')).not.toBeNull();

    await TestBed.inject(Router).navigateByUrl('/no-such-page');
    await app.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/consumptions');
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
    expect(TestBed.inject(Router).url).toBe('/substances');
    expect(app.title()).toBe('Substances');
    expect(app.sidebar.opened).toBe(false);
  });
});
