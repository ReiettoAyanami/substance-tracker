import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

import { errorInterceptor } from '../data/error-interceptor';
import { DownloadPage } from './download-page';

describe('DownloadPage', () => {
  let fixture: ComponentFixture<DownloadPage>;
  let backend: HttpTestingController;
  const element = () => fixture.nativeElement as HTMLElement;
  const text = () => (element().textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DownloadPage],
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  /** The page, the instance answering its version and whether it carries the APK. */
  async function render(version: string, apk: boolean): Promise<void> {
    fixture = TestBed.createComponent(DownloadPage);
    TestBed.tick();
    backend.expectOne('/api/version').flush({ version, apiLevel: 1 });
    const head = backend.expectOne('/download/substance.apk');
    if (apk) head.flush(null);
    else head.flush(null, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
  }

  it('offers the APK the instance carries, with its version and how to install it', async () => {
    await render('a26.1.0', true);
    const link = element().querySelector<HTMLAnchorElement>('a.download')!;
    expect(link.getAttribute('href')).toBe('/download/substance.apk');
    expect(link.hasAttribute('download')).toBe(true);
    expect(text()).toContain('Version a26.1.0, the same as this server.');
    expect(text()).toContain(`give it this server's address: ${location.origin}`);
    expect(text()).toContain('Android 7.0 or later');
  });

  it('without an APK, sends a final version to its GitHub Release', async () => {
    await render('v26.2.0', false);
    const link = element().querySelector<HTMLAnchorElement>('a.download')!;
    expect(link.getAttribute('href')).toBe('https://github.com/ReiettoAyanami/substance-tracker/releases/tag/v26.2.0');
    expect(text()).toContain('This server does not carry the app');
  });

  it('a development version without an APK has nothing to download', async () => {
    await render('dev26.0.0', false);
    expect(element().querySelector('a.download')).toBeNull();
    expect(text()).toContain('development version, which has no app to download');
  });

  it('opened over http, says the app needs the https address', async () => {
    await render('a26.1.0', true);
    // jsdom serves the tests from http://localhost
    expect(location.protocol).toBe('http:');
    expect(text()).toContain('the app will need this server\'s https address');
  });
});
