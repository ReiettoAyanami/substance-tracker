import { DestroyRef, Injectable, Injector, Signal, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom, race, timeout, timer } from 'rxjs';

import { VersionApi } from '../data/version-api';
import { Queue } from '../queue/queue';

/** How long a pull waits for the server before it gives up (2.11, lenzi 2026-10-05: 3-4 s, not the 15 s of "offline"). */
export const PULL_ANSWER_MS = 3_500;

/** How long the indicator waits for the page's data, at most, once the server answered. */
export const PULL_RELOAD_MS = 15_000;

/** Something a page shows that a pull asks again: a resource, or what behaves like one. */
export interface Refreshable {
  reload(): unknown;
  isLoading: Signal<boolean>;
}

/** How a pull ended: the page asked its data again, or the server did not answer in time. */
export type PullOutcome = 'refreshed' | 'unreachable';

/**
 * Pull-to-refresh in the Android app (roadmap 2.11, design-android.md, "pull to refresh"): what the
 * open page shows registers here (refreshOnPull), and a pull asks it all again. First a real try,
 * a short one: `/api/version`, 3.5 s at most. Without an answer the pull spins for nothing and the
 * "Offline · data from…" bar stays; with one (which brings an offline app back online, and with it
 * the queue) every registered source reloads and the queue is sent. The resources keep their value
 * while they reload, so the page stays as it is until the new data comes.
 */
@Injectable({
  providedIn: 'root',
})
export class PageRefresh {
  private readonly versionApi = inject(VersionApi);
  private readonly injector = inject(Injector);
  private readonly sources = signal<readonly Refreshable[]>([]);

  /** Sources shown until `destroyRef` (the component that shows them) goes. */
  add(sources: readonly Refreshable[], destroyRef: DestroyRef): void {
    this.sources.update((all) => [...all, ...sources]);
    destroyRef.onDestroy(() => this.sources.update((all) => all.filter((source) => !sources.includes(source))));
  }

  /** A pull: resolves once the page has its new data, or once it is clear the server is not there. */
  async pull(): Promise<PullOutcome> {
    try {
      await firstValueFrom(this.versionApi.getServerVersion().pipe(timeout(PULL_ANSWER_MS)));
    } catch {
      return 'unreachable';
    }
    const sources = this.sources();
    for (const source of sources) source.reload();
    void this.injector.get(Queue).send();
    const loading = computed(() => sources.some((source) => source.isLoading()));
    await firstValueFrom(race(toObservable(loading, { injector: this.injector }).pipe(filter((busy) => !busy)), timer(PULL_RELOAD_MS)));
    return 'refreshed';
  }
}

/**
 * Registers what a component shows with the pull-to-refresh of the Android app (PageRefresh); in an
 * injection context (a constructor, a field). `reload`, when given, replaces the sources' own
 * reloads (a page that also resets its own state, such as the pages loaded with "Show more").
 */
export function refreshOnPull(sources: readonly Refreshable[], reload?: () => void): void {
  const refresh = inject(PageRefresh);
  const destroyRef = inject(DestroyRef);
  if (!reload) {
    refresh.add(sources, destroyRef);
    return;
  }
  const isLoading = computed(() => sources.some((source) => source.isLoading()));
  refresh.add([{ reload, isLoading }], destroyRef);
}
