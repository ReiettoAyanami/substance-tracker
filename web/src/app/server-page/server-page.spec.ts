import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Router } from '@angular/router';

import { RUNS_IN_APP } from '../connection/address';
import { ServerAddress } from '../connection/server-address';
import { errorInterceptor } from '../data/error-interceptor';
import { ServerPage } from './server-page';

describe('ServerPage', () => {
  let fixture: ComponentFixture<ServerPage>;
  let backend: HttpTestingController;
  let server: ServerAddress;
  let navigated: string[];
  const element = () => fixture.nativeElement as HTMLElement;
  const error = () => (element().querySelector('.form-error')?.textContent ?? '').trim();

  async function render(devApp = false): Promise<void> {
    TestBed.configureTestingModule({
      imports: [ServerPage],
      providers: [
        { provide: RUNS_IN_APP, useValue: true },
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    server = TestBed.inject(ServerAddress);
    vi.spyOn(server, 'allowsHttp').mockResolvedValue(devApp);
    navigated = [];
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation(async (url) => {
      navigated.push(String(url));
      return true;
    });
    fixture = TestBed.createComponent(ServerPage);
    await fixture.whenStable();
  }

  /** Types the address and presses Connect; resolves once the page asked the server, if it did. */
  async function connect(typed: string): Promise<void> {
    const input = element().querySelector<HTMLInputElement>('input')!;
    input.value = typed;
    input.dispatchEvent(new Event('input'));
    element().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await new Promise((resolve) => setTimeout(resolve));
  }

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  it('keeps the address of a substance tracker, then goes to the sign-in page', async () => {
    await render();
    await connect('tracker.example.com/lenzi');
    backend.expectOne('https://tracker.example.com/api/version').flush({ version: 'a26.1.0', apiLevel: 1 });
    await settle();
    expect(server.address()).toBe('https://tracker.example.com');
    expect(navigated).toEqual(['/login']);
  });

  it('refuses http in the release app, and says how to get https', async () => {
    await render();
    await connect('http://192.168.1.20:8080');
    await settle();
    expect(error()).toContain('The app talks only https');
    expect(error()).toContain('Tailscale');
    expect(server.address()).toBeNull();
  });

  it('the dev app takes http', async () => {
    await render(true);
    await connect('http://192.168.1.20:8080');
    backend.expectOne('http://192.168.1.20:8080/api/version').flush({ version: 'dev26.0.0', apiLevel: 1 });
    await settle();
    expect(server.address()).toBe('http://192.168.1.20:8080');
  });

  it('a server with a build number is a substance tracker too', async () => {
    await render();
    await connect('https://tracker.example.com');
    backend.expectOne('https://tracker.example.com/api/version').flush({ version: 'a26.0.0.0001', apiLevel: 1 });
    await settle();
    expect(server.address()).toBe('https://tracker.example.com');
  });

  it('something that is not a substance tracker, or nothing at all, is not kept', async () => {
    await render();
    await connect('https://example.com');
    backend.expectOne('https://example.com/api/version').flush('<html></html>');
    await settle();
    expect(error()).toBe('Something answers at this address, but it is not a substance tracker.');

    await connect('https://example.com');
    backend.expectOne('https://example.com/api/version').flush(null, { status: 404, statusText: 'Not Found' });
    await settle();
    expect(error()).toBe('Something answers at this address, but it is not a substance tracker.');

    await connect('https://nowhere.example.com');
    backend.expectOne('https://nowhere.example.com/api/version').error(new ProgressEvent('error'));
    await settle();
    expect(error()).toContain('The server does not answer at this address.');
    expect(server.address()).toBeNull();
    expect(navigated).toEqual([]);
  });
});
