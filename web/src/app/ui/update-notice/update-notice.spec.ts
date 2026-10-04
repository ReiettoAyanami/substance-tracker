import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { Compatibility, Standing } from '../../connection/compatibility';
import { ServerAddress } from '../../connection/server-address';
import { UpdateNotice } from './update-notice';

describe('UpdateNotice', () => {
  async function render(standing: Standing): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [UpdateNotice],
      providers: [
        {
          provide: Compatibility,
          useValue: { standing: signal(standing), appVersion: 'a26.1.4', serverVersion: signal({ version: 'a26.2.0', apiLevel: 2 }) },
        },
        { provide: ServerAddress, useValue: { address: signal('https://tracker.example.com') } },
      ],
    });
    const fixture = TestBed.createComponent(UpdateNotice);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('same version: nothing', async () => {
    expect(text(await render('same'))).toBe('');
  });

  it('another version at the same level: a bar with the download', async () => {
    const element = await render('newer-version');
    expect(text(element.querySelector('.bar .text'))).toBe('A new version of the app is available');
    expect(element.querySelector('a.get')?.getAttribute('href')).toBe('https://tracker.example.com/download');
    expect(element.querySelector('.screen')).toBeNull();
  });

  it('the app older: "Update required" over everything, nothing to close it', async () => {
    const element = await render('app-older');
    expect(text(element.querySelector('.screen .title'))).toBe('Update required');
    expect(text(element.querySelector('.screen .text'))).toContain('This app (a26.1.4) is older than your server (a26.2.0)');
    expect(element.querySelector('a.get')?.getAttribute('href')).toBe('https://tracker.example.com/download');
    expect(element.querySelector('button')).toBeNull();
  });

  it('the server older: the two ways out', async () => {
    const element = await render('server-older');
    expect(text(element.querySelector('.screen .title'))).toBe('Your server is older');
    expect(text(element.querySelector('.screen .text'))).toContain('Ask whoever runs the server to update it');
  });
});
