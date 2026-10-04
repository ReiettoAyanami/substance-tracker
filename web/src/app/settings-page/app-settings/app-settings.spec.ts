import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';

import { APP_VERSION } from '../../app-version';
import { RUNS_IN_APP } from '../../connection/address';
import { ServerAddress } from '../../connection/server-address';
import { errorInterceptor } from '../../data/error-interceptor';
import { HistoryDialogs } from '../../history-dialogs';
import { Session } from '../../session/session';
import { AppSettings } from './app-settings';

describe('AppSettings', () => {
  let fixture: ComponentFixture<AppSettings>;
  let backend: HttpTestingController;
  let server: ServerAddress;
  let session: Session;
  let navigated: string[];
  let confirmed: boolean;
  const element = () => fixture.nativeElement as HTMLElement;
  const text = () => (element().textContent ?? '').replace(/\s+/g, ' ').trim();

  async function render(user: { role: string; impersonatedBy: number | null } = { role: 'user', impersonatedBy: null }): Promise<void> {
    TestBed.configureTestingModule({
      imports: [AppSettings],
      providers: [
        { provide: RUNS_IN_APP, useValue: true },
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        {
          provide: HistoryDialogs,
          // The confirmation runs its action and says it was confirmed, or says nothing (Cancel).
          useValue: {
            open: async (_component: unknown, data: { action: () => Observable<unknown> }) => {
              if (!confirmed) return undefined;
              await new Promise<void>((resolve) => data.action().subscribe({ complete: resolve }));
              return true;
            },
          },
        },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    server = TestBed.inject(ServerAddress);
    server.set('https://tracker.example.com');
    session = TestBed.inject(Session);
    vi.spyOn(session, 'user').mockReturnValue({ id: 1, username: 'lenzi', ...user } as never);
    navigated = [];
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation(async (url) => {
      navigated.push(String(url));
      return true;
    });
    fixture = TestBed.createComponent(AppSettings);
    TestBed.tick();
    backend.expectOne('/api/version').flush({ version: 'a26.2.0', apiLevel: 1 });
    await fixture.whenStable();
  }

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  it("shows the server, the app's version and the server's", async () => {
    await render();
    const facts = Array.from(element().querySelectorAll('dt'), (dt) => [dt.textContent?.trim(), dt.nextElementSibling?.textContent?.trim()]);
    expect(facts).toEqual([
      ['Server', 'https://tracker.example.com'],
      ['App version', APP_VERSION],
      ['Server version', 'a26.2.0'],
    ]);
    expect(text()).not.toContain('Administration');
  });

  it('tells an administrator that administration is on the website', async () => {
    await render({ role: 'admin', impersonatedBy: null });
    expect(text()).toContain('Administration is on the website: https://tracker.example.com/lenzi/admin');
  });

  it('Change server signs out, forgets the server and goes to the server screen', async () => {
    confirmed = true;
    await render();
    const signOut = vi.spyOn(session, 'signOut').mockResolvedValue();
    element().querySelector<HTMLButtonElement>('.change-server')!.click();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(signOut).toHaveBeenCalled();
    expect(server.address()).toBeNull();
    expect(navigated).toEqual(['/server']);
  });

  it('a server that does not answer the sign-out is forgotten all the same', async () => {
    confirmed = true;
    await render();
    vi.spyOn(session, 'signOut').mockRejectedValue({ status: null });
    const forget = vi.spyOn(session, 'forget');
    element().querySelector<HTMLButtonElement>('.change-server')!.click();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(forget).toHaveBeenCalled();
    expect(server.address()).toBeNull();
  });

  it('Cancel changes nothing', async () => {
    confirmed = false;
    await render();
    element().querySelector<HTMLButtonElement>('.change-server')!.click();
    await new Promise((resolve) => setTimeout(resolve));
    expect(server.address()).toBe('https://tracker.example.com');
    expect(navigated).toEqual([]);
  });
});
