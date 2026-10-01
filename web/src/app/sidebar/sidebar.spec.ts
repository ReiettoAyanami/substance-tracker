import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { Sidebar } from './sidebar';

@Component({ template: '' })
class Blank {}

describe('Sidebar', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'consumptions', component: Blank },
          { path: 'substances', component: Blank, children: [{ path: ':id', component: Blank }] },
          { path: 'metrics', component: Blank },
          { path: 'statistics', component: Blank },
        ]),
      ],
    });
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

  it('links to every page, with its icon, under the name of the app', async () => {
    const fixture = await sidebarAt('/consumptions');
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.app-name')?.textContent?.trim()).toBe('Substance tracker');
    expect(links(element).map(({ icon, label, href }) => ({ icon, label, href }))).toEqual([
      { icon: 'history', label: 'Consumptions', href: '/consumptions' },
      { icon: 'inventory_2', label: 'Substances', href: '/substances' },
      { icon: 'table_chart', label: 'Metrics', href: '/metrics' },
      { icon: 'insights', label: 'Statistics', href: '/statistics' },
    ]);
  });

  it('highlights the current page, also on a child route', async () => {
    const onConsumptions = await sidebarAt('/consumptions');
    expect(links(onConsumptions.nativeElement).map((l) => l.current)).toEqual(['page', null, null, null]);

    await TestBed.inject(Router).navigateByUrl('/substances/5');
    await onConsumptions.whenStable();
    expect(links(onConsumptions.nativeElement).map((l) => l.current)).toEqual([null, 'page', null, null]);
    expect(onConsumptions.nativeElement.querySelector('.mdc-list-item--activated')?.textContent).toContain('Substances');
  });

  it('says when a link was tapped, and goes to its page', async () => {
    const fixture = await sidebarAt('/consumptions');
    let tapped = 0;
    fixture.componentInstance.navigated.subscribe(() => tapped++);

    (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a[href="/substances"]')!.click();
    await fixture.whenStable();

    expect(tapped).toBe(1);
    expect(TestBed.inject(Router).url).toBe('/substances');
  });
});
