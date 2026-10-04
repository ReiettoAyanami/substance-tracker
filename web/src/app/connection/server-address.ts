import { Injectable, inject, signal } from '@angular/core';
import { App } from '@capacitor/app';

import { RUNS_IN_APP } from './address';

/** Where the app keeps its server address: its own storage, which never leaves the phone (no backup). */
const KEY = 'substance-tracker.server';

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * The Android app's server address (design-android.md, "server address"): the instance it talks
 * to, typed at the first launch, one at a time. The website has none: its pages and its API share
 * their address.
 */
@Injectable({
  providedIn: 'root',
})
export class ServerAddress {
  private readonly inApp = inject(RUNS_IN_APP);
  private readonly stored = signal<string | null>(this.inApp ? read() : null);

  /** The server's origin (`https://tracker.example.com`), or null before the first launch's choice. */
  readonly address = this.stored.asReadonly();

  set(address: string): void {
    try {
      localStorage.setItem(KEY, address);
    } catch {
      // Storage refused: the address holds until the app closes.
    }
    this.stored.set(address);
  }

  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing stored.
    }
    this.stored.set(null);
  }

  /** The dev app also talks plain http, to a PC at home (design-android.md, "release app and dev app"). */
  async allowsHttp(): Promise<boolean> {
    if (!this.inApp) return false;
    const info = await App.getInfo();
    return info.id.endsWith('.dev');
  }
}
