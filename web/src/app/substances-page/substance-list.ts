import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { catchError, distinctUntilChanged, forkJoin, map, of, shareReplay, switchMap } from 'rxjs';

import { ApiError } from '../data/api-error';
import { CatalogApi } from '../data/catalog-api';
import { Settings } from '../data/settings';
import { SettingsApi } from '../data/settings-api';
import { Substance } from '../data/substance';
import { LOCALE } from '../locale';

/** The substances page's list: nothing yet, the substances (API order) with the settings, or why not. */
export type SubstanceListState =
  | { status: 'loading' }
  | { status: 'loaded'; settings: Settings; substances: Substance[] }
  | { status: 'failed'; error: ApiError };

/**
 * The substances shown by the substances page: all of them, or those the search of the URL finds
 * (`?q=`, design-frontend.md, "substances search bar"), asked again whenever that search changes.
 * Provided by the SubstancesPage component (not root), so the substance page, its child route,
 * reads the same list and the same order for prev/next.
 */
@Injectable()
export class SubstanceList {
  private readonly catalog = inject(CatalogApi);
  private readonly current = signal<SubstanceListState>({ status: 'loading' });
  readonly state = this.current.asReadonly();

  constructor() {
    // The settings are asked once; the substances, for every search. The list shown stays until the next one arrives.
    const settings = inject(SettingsApi).getSettings().pipe(shareReplay(1));
    inject(ActivatedRoute)
      .queryParamMap.pipe(
        map((query) => searchOf(query.get('q'))),
        distinctUntilChanged(),
        switchMap((q) =>
          forkJoin([settings, this.catalog.listSubstances(q ? { q } : {})]).pipe(
            map(([settings, substances]): SubstanceListState => ({ status: 'loaded', settings, substances })),
            catchError((error: ApiError) => of<SubstanceListState>({ status: 'failed', error })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  /** A substance just created (the 201 of POST): shown right away, where the API would list it. */
  add(substance: Substance): void {
    this.change((substances) => [...substances, substance].sort(apiOrder));
  }

  /** A substance just changed (the PATCH): in its new place, since its name may have changed. */
  replace(substance: Substance): void {
    this.change((substances) => substances.map((s) => (s.id === substance.id ? substance : s)).sort(apiOrder));
  }

  /**
   * A substance whose numbers changed with a write elsewhere (a batch recorded for it): asked again,
   * since its card summary is the API's. If it cannot be, the card stays as it was.
   */
  reload(id: number): void {
    this.catalog.getSubstance(id).subscribe({
      next: (substance) => this.replace(substance),
      error: () => undefined,
    });
  }

  /** A substance just deleted: gone. */
  remove(id: number): void {
    this.change((substances) => substances.filter((s) => s.id !== id));
  }

  private change(next: (substances: Substance[]) => Substance[]): void {
    this.current.update((state) => (state.status === 'loaded' ? { ...state, substances: next(state.substances) } : state));
  }
}

/** The search of a URL's `?q=`: its text without the blanks around it; '' for none. */
export const searchOf = (q: string | null) => (q ?? '').trim();

/**
 * Like the API: ORDER BY name (utf8mb4_0900_ai_ci: case and accents ignored), id. The English
 * collation is the root one for Latin letters, as MySQL's 0900 collations.
 */
const names = new Intl.Collator(LOCALE, { sensitivity: 'base' });
const apiOrder = (a: Substance, b: Substance) => names.compare(a.name, b.name) || a.id - b.id;
