import { Injectable, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';

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
 * The substances shown by the substances page, loaded once. Provided by the SubstancesPage
 * component (not root), so the substance page, its child route, reads the same list and the same
 * order for prev/next.
 */
@Injectable()
export class SubstanceList {
  private readonly current = signal<SubstanceListState>({ status: 'loading' });
  readonly state = this.current.asReadonly();

  constructor() {
    forkJoin([inject(SettingsApi).getSettings(), inject(CatalogApi).listSubstances()]).subscribe({
      next: ([settings, substances]) => this.current.set({ status: 'loaded', settings, substances }),
      error: (error: ApiError) => this.current.set({ status: 'failed', error }),
    });
  }

  /** A substance just created (the 201 of POST): shown right away, where the API would list it. */
  add(substance: Substance): void {
    this.change((substances) => [...substances, substance].sort(apiOrder));
  }

  /** A substance just changed (the PATCH): in its new place, since its name may have changed. */
  replace(substance: Substance): void {
    this.change((substances) => substances.map((s) => (s.id === substance.id ? substance : s)).sort(apiOrder));
  }

  /** A substance just deleted: gone. */
  remove(id: number): void {
    this.change((substances) => substances.filter((s) => s.id !== id));
  }

  private change(next: (substances: Substance[]) => Substance[]): void {
    this.current.update((state) => (state.status === 'loaded' ? { ...state, substances: next(state.substances) } : state));
  }
}

/**
 * Like the API: ORDER BY name (utf8mb4_0900_ai_ci: case and accents ignored), id. The English
 * collation is the root one for Latin letters, as MySQL's 0900 collations.
 */
const names = new Intl.Collator(LOCALE, { sensitivity: 'base' });
const apiOrder = (a: Substance, b: Substance) => names.compare(a.name, b.name) || a.id - b.id;
