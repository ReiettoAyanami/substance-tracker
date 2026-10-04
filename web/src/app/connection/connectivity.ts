import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { App } from '@capacitor/app';

import { VersionApi } from '../data/version-api';
import { RUNS_IN_APP } from './address';

/** While offline, how often the app asks the server whether it is back (proposal). */
export const PROBE_EVERY_MS = 30_000;

/**
 * Whether the Android app's server answers (design-android.md, "offline"): offline when a request
 * got no answer (no network, nothing in 15 s, 502-504: isUnreachable), online again at the first
 * answer. `navigator.onLine` decides nothing. While offline it asks `/api/version` every 30 s and
 * whenever the user comes back to the app. The website is never offline here: it has no last data.
 */
@Injectable({
  providedIn: 'root',
})
export class Connectivity {
  private readonly versionApi = inject(VersionApi);
  private readonly inApp = inject(RUNS_IN_APP);
  private readonly offlineState = signal(false);
  private readonly dataAtState = signal<string | null>(null);
  private readonly missingState = signal(false);
  private probe: ReturnType<typeof setInterval> | null = null;

  /** No answer from the server: the pages show their last data. */
  readonly offline = this.offlineState.asReadonly();
  /** The time of the last data a page was drawn from while offline, for the bar. */
  readonly dataAt = this.dataAtState.asReadonly();
  /** A read of the page shown had nothing on the phone ("Not available offline"). */
  readonly missing = this.missingState.asReadonly();

  constructor() {
    if (!this.inApp) return;
    const resume = App.addListener('resume', () => {
      if (this.offlineState()) this.ask();
    });
    inject(DestroyRef).onDestroy(() => {
      void resume.then((handle) => handle.remove());
      this.stopProbe();
    });
  }

  /** A request got an answer, any answer: the server is there. */
  answered(): void {
    if (!this.offlineState()) return;
    this.offlineState.set(false);
    this.dataAtState.set(null);
    this.missingState.set(false);
    this.stopProbe();
  }

  /** A request got no answer. */
  unanswered(): void {
    if (!this.inApp || this.offlineState()) return;
    this.offlineState.set(true);
    this.probe = setInterval(() => this.ask(), PROBE_EVERY_MS);
  }

  /** A page was drawn from data the server gave at `at`. */
  showedDataFrom(at: string): void {
    this.dataAtState.set(at);
  }

  /** A read had nothing on the phone. */
  missed(): void {
    this.missingState.set(true);
  }

  /** Another page opens: what was missing belonged to the one before. */
  newPage(): void {
    this.missingState.set(false);
  }

  /** Is the server back? The answer goes through the interceptors, which say so. */
  private ask(): void {
    this.versionApi.getServerVersion().subscribe({ error: () => undefined });
  }

  private stopProbe(): void {
    if (this.probe !== null) clearInterval(this.probe);
    this.probe = null;
  }
}
