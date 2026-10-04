import { Injectable, inject, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { CapacitorCookies } from '@capacitor/core';

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

  /**
   * Every cookie of the phone's store, the session's included: when the app forgets its server, a
   * server that did not answer the sign-out keeps its session, but the phone must not (found on
   * lenzi's phone, 2026-10-05).
   */
  async clearCookies(): Promise<void> {
    if (!this.inApp) return;
    try {
      await CapacitorCookies.clearAllCookies();
    } catch {
      // No cookie store to clear.
    }
  }

  /** The dev app also talks plain http, to a PC at home (design-android.md, "release app and dev app"). */
  async allowsHttp(): Promise<boolean> {
    if (!this.inApp) return false;
    const info = await App.getInfo();
    return info.id.endsWith('.dev');
  }
}
