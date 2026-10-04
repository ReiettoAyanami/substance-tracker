import { Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { rxResource } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';

import { Connectivity } from '../../connection/connectivity';
import { SettingsApi } from '../../data/settings-api';
import { LOCALE } from '../../locale';
import { Session } from '../../session/session';

/**
 * The Android app's offline bar (design-android.md, "last data"): "Offline · data from 14:32", the
 * time the server gave the data the page shows (with its day when not today), in the time zone of
 * the settings like every time of the app (their last answer, offline); "this page is not available
 * offline" when a read of the page had nothing on the phone. Shown while the server does not answer;
 * it goes at the first answer.
 */
@Component({
  selector: 'app-offline-bar',
  imports: [MatIconModule],
  templateUrl: './offline-bar.html',
  styleUrl: './offline-bar.css',
})
export class OfflineBar {
  private readonly connectivity = inject(Connectivity);
  private readonly settingsApi = inject(SettingsApi);
  private readonly session = inject(Session);
  /** Asked again once the user is known: before, the phone has no settings to give (they are per user). */
  private readonly settings = rxResource({
    params: () => ({ user: this.session.user()?.id }),
    stream: () => this.settingsApi.getSettings(),
  });

  constructor() {
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationStart),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.connectivity.newPage());
  }

  protected readonly text = computed(() => {
    if (this.connectivity.missing()) return 'Offline · this page is not available offline';
    const at = this.connectivity.dataAt();
    if (!at) return 'Offline';
    // Not there (yet): the phone's own zone. A resource in error must not be read.
    const timeZone = this.settings.hasValue() ? this.settings.value().timezone : undefined;
    const day = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(date);
    const when = new Date(at);
    const today = day(when) === day(new Date());
    const format = new Intl.DateTimeFormat(LOCALE, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      ...(today ? {} : { day: 'numeric', month: 'short' }),
    });
    return `Offline · data from ${format.format(when)}`;
  });
}
