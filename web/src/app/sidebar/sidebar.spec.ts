import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';

import { AuthApi } from '../data/auth-api';
import { Session } from '../session/session';
import { Sidebar } from './sidebar';

@Component({ template: '' })
class Blank {}

describe('Sidebar', () => {
  let signOut: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    signOut = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: Blank },
          {
            path: 'lenzi',
            children: [
              { path: '', component: Blank },
              { path: 'substances', component: Blank, children: [{ path: ':id', component: Blank }] },
              { path: 'metrics', component: Blank },
              { path: 'statistics', component: Blank },
              { path: 'settings', component: Blank },
            ],
          },
        ]),
        {
          provide: AuthApi,
          useValue: { getSession: () => of({ id: 1, username: 'lenzi', role: 'user', impersonatedBy: null }), signOut },
        },
      ],
    });
    await TestBed.inject(Session).load();
  });

  /** The sidebar, after the router went to `url`. */
  async function sidebarAt(url: string) {
    await RouterTestingHarness.create(url);
    const fixture = TestBed.createComponent(Sidebar);
    await fixture.whenStable();
    return fixture;
  }

  const links = (element: HTMLElement) =>
    Array.from(element.querySelectorAll<HTMLAnchorElement>('a[mat-list-item]')).map((a) => ({
      icon: a.querySelector('mat-icon')?.textContent?.trim(),
      label: a.querySelector('[matListItemTitle]')?.textContent?.trim(),
      href: a.getAttribute('href'),
      current: a.getAttribute('aria-current'),
    }));

  it("links to every page of the user, under their username, below the app's name and the username", async () => {
    const fixture = await sidebarAt('/lenzi');
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.app-name')?.textContent?.trim()).toBe('Substance tracker');
    expect(element.querySelector('.username')?.textContent?.trim()).toBe('lenzi');
    expect(links(element).map(({ icon, label, href }) => ({ icon, label, href }))).toEqual([
      { icon: 'history', label: 'Consumptions', href: '/lenzi' },
      { icon: 'inventory_2', label: 'Substances', href: '/lenzi/substances' },
      { icon: 'table_chart', label: 'Metrics', href: '/lenzi/metrics' },
      { icon: 'insights', label: 'Statistics', href: '/lenzi/statistics' },
      { icon: 'settings', label: 'Settings', href: '/lenzi/settings' },
    ]);
  });

  it('puts "Sign out" and the settings at the bottom, apart from the pages', async () => {
    const element = (await sidebarAt('/lenzi/settings')).nativeElement as HTMLElement;
    const lists = Array.from(element.querySelectorAll('mat-nav-list'));

    expect(lists.map((list) => Array.from(list.querySelectorAll('[matListItemTitle]')).map((t) => t.textContent?.trim()))).toEqual([
      ['Consumptions', 'Substances', 'Metrics', 'Statistics'],
      ['Sign out', 'Settings'],
    ]);
    expect(lists[1]!.classList).toContain('bottom');
    expect(links(element).map((l) => l.current)).toEqual([null, null, null, null, 'page']);
  });

  it('highlights the current page, also on a child route; Consumptions only on the start page, whatever its filter', async () => {
    const fixture = await sidebarAt('/lenzi?substance=3');
    expect(links(fixture.nativeElement).map((l) => l.current)).toEqual(['page', null, null, null, null]);

    await TestBed.inject(Router).navigateByUrl('/lenzi/substances/5');
    await fixture.whenStable();
    expect(links(fixture.nativeElement).map((l) => l.current)).toEqual([null, 'page', null, null, null]);
    expect(fixture.nativeElement.querySelector('.mdc-list-item--activated')?.textContent).toContain('Substances');
  });

  it('says when a link was tapped, and goes to its page', async () => {
    const fixture = await sidebarAt('/lenzi');
    let tapped = 0;
    fixture.componentInstance.navigated.subscribe(() => tapped++);

    (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a[href="/lenzi/substances"]')!.click();
    await fixture.whenStable();

    expect(tapped).toBe(1);
    expect(TestBed.inject(Router).url).toBe('/lenzi/substances');
  });

  it('signs out: the drawer closes, the session ends, the sign-in page opens', async () => {
    const fixture = await sidebarAt('/lenzi/metrics');
    let tapped = 0;
    fixture.componentInstance.navigated.subscribe(() => tapped++);

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.sign-out')!.click();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/login'));

    expect(tapped).toBe(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(Session).user()).toBeNull();
  });

  it('an administrator acting as itself also finds "Admin", above "Sign out"', async () => {
    const auth = TestBed.inject(AuthApi) as unknown as { getSession: () => unknown };
    auth.getSession = () => of({ id: 1, username: 'lenzi', role: 'admin', impersonatedBy: null });
    await TestBed.inject(Session).reload();
    const fixture = await sidebarAt('/lenzi');
    const element = fixture.nativeElement as HTMLElement;
    const bottomTitles = () =>
      Array.from(element.querySelectorAll('mat-nav-list')[1]!.querySelectorAll('[matListItemTitle]')).map((t) => t.textContent?.trim());

    expect(bottomTitles()).toEqual(['Admin', 'Sign out', 'Settings']);
    expect(element.querySelectorAll('mat-nav-list')[1]!.querySelector('a')?.getAttribute('href')).toBe('/admin');

    // while impersonating, never: the admin view is not for the user being viewed
    auth.getSession = () => of({ id: 1, username: 'lenzi', role: 'admin', impersonatedBy: 3 });
    await TestBed.inject(Session).reload();
    await fixture.whenStable();
    expect(bottomTitles()).toEqual(['Sign out', 'Settings']);
  });

  it('a sign-out the server did not take: still signed in, the drawer stays open and says why', async () => {
    signOut.mockReturnValue(throwError(() => ({ status: null })));
    const fixture = await sidebarAt('/lenzi/metrics');
    let tapped = 0;
    fixture.componentInstance.navigated.subscribe(() => tapped++);
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector<HTMLButtonElement>('button.sign-out')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(element.querySelector('.sign-out-error')?.textContent?.trim()).toBe('Not signed out: the server cannot be reached.');
    });

    expect(tapped).toBe(0);
    expect(TestBed.inject(Router).url).toBe('/lenzi/metrics');
    expect(TestBed.inject(Session).user()?.username).toBe('lenzi');
  });
});
