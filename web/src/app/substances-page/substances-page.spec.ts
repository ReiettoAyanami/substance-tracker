import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Router, provideRouter } from '@angular/router';

import { errorInterceptor } from '../data/error-interceptor';
import { Substance } from '../data/substance';
import { SubstancesPage } from './substances-page';

const settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };

function substance(id: number, name: string): Substance {
  return {
    id,
    name,
    unit: 'g',
    refillQuantity: null,
    archived: false,
    archivedAt: null,
    createdAt: '2026-09-01T10:00:00Z',
    summary: {
      stock: '0.000',
      stockBarMax: '0.000',
      stockBarSegments: [],
      peakStock: '0.000',
      lastBatch: null,
      avgUnitPrice: null,
      lastConsumption: null,
      avgQuantityPerConsumption: null,
      avgPricePerConsumption: null,
      spendThisMonth: '0.00',
    },
  };
}

describe('SubstancesPage', () => {
  let fixture: ComponentFixture<SubstancesPage>;
  let backend: HttpTestingController;

  const names = () =>
    Array.from(fixture.nativeElement.querySelectorAll('app-substance-card .name')).map((n) =>
      (n as HTMLElement).textContent?.trim(),
    );

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubstancesPage],
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        // jsdom has no animation events: close dialogs at once
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
    backend = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SubstancesPage);
    await fixture.whenStable();
  });

  afterEach(() => backend.verify());

  /** Lets the dialog's history entry go (a popstate) and the view settle. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await fixture.whenStable();
    }
  }

  /** Opens the ⋮ menu of a card and taps one of its items. */
  async function menu(substanceName: string, item: string): Promise<void> {
    const card = Array.from(fixture.nativeElement.querySelectorAll('app-substance-card') as NodeListOf<HTMLElement>).find(
      (c) => c.querySelector('.name')?.textContent?.trim() === substanceName,
    )!;
    card.querySelector<HTMLButtonElement>('button.more')!.click();
    await fixture.whenStable();
    Array.from(document.querySelectorAll<HTMLButtonElement>('.mat-mdc-menu-item'))
      .find((b) => b.textContent?.includes(item))!
      .click();
    await fixture.whenStable();
  }

  it('shows one card per substance, in the order the API gives', async () => {
    backend.expectOne('/api/settings').flush(settings);
    backend.expectOne('/api/substances').flush([substance(4, 'Birra'), substance(1, 'Caffè'), substance(3, 'Erba')]);
    await fixture.whenStable();

    expect(names()).toEqual(['Birra', 'Caffè', 'Erba']);
  });

  it('says "No substances" when there are none, and not while loading', async () => {
    const empty = () => fixture.nativeElement.querySelector('.empty')?.textContent?.trim();
    expect(empty()).toBeUndefined();

    backend.expectOne('/api/settings').flush(settings);
    backend.expectOne('/api/substances').flush([]);
    await fixture.whenStable();

    expect(empty()).toBe('No substances');
    expect(names()).toEqual([]);
  });

  it('says why when the API fails, instead of an empty page', async () => {
    backend.expectOne('/api/settings').flush(settings);
    backend.expectOne('/api/substances').flush(null, { status: 500, statusText: 'Internal Server Error' });
    await fixture.whenStable();

    const error = fixture.nativeElement.querySelector('.error')?.textContent?.replace(/\s+/g, ' ').trim();
    expect(error).toBe('Could not load the substances: Internal Server Error (500)');
    expect(fixture.nativeElement.querySelector('.empty')).toBeNull();
  });

  it('opens the form from the "+" and shows the created substance right away, in its place', async () => {
    backend.expectOne('/api/settings').flush(settings);
    backend.expectOne('/api/substances').flush([substance(4, 'Birra'), substance(3, 'Erba')]);
    await fixture.whenStable();

    fixture.nativeElement.querySelector('app-add-button button[aria-label="Add substance or batch"]').click();
    await fixture.whenStable();
    const form = document.querySelector('app-substance-form')!;
    expect(form).not.toBeNull(); // "New": Substance, the first of the two

    for (const [field, value] of [['name', 'Caffè'], ['unit', 'capsula']]) {
      const input = form.querySelector<HTMLInputElement>(`input[formControlName="${field}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    backend.expectOne('/api/substances').flush(substance(9, 'Caffè'), { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    await settle();
    expect(document.querySelector('app-substance-form')).toBeNull();
    expect(names()).toEqual(['Birra', 'Caffè', 'Erba']);
  });

  it('records a batch from the "+" (New: Batch) and asks its substance again, so the card shows the new stock', async () => {
    backend.expectOne('/api/settings').flush(settings);
    backend.expectOne('/api/substances').flush([substance(4, 'Birra'), substance(3, 'Erba')]);
    await fixture.whenStable();
    const segments = () => fixture.nativeElement.querySelectorAll('app-substance-card .segment').length;
    expect(segments()).toBe(0);

    fixture.nativeElement.querySelector('app-add-button button').click();
    await fixture.whenStable();
    document.querySelector<HTMLElement>('app-entity-dialog mat-select.kind-select')!.click();
    await fixture.whenStable();
    Array.from(document.querySelectorAll<HTMLElement>('mat-option'))
      .find((o) => o.textContent?.trim() === 'Batch')!
      .click();
    TestBed.tick(); // the batch form asks for the settings and the substances once drawn
    backend.expectOne('/api/settings').flush(settings);
    backend.expectOne('/api/substances').flush([substance(4, 'Birra'), substance(3, 'Erba')]);
    await fixture.whenStable();

    const form = document.querySelector('app-batch-form')!;
    form.querySelector<HTMLElement>('mat-select.substance')!.click();
    await fixture.whenStable();
    Array.from(document.querySelectorAll<HTMLElement>('mat-option'))
      .find((o) => o.textContent?.trim() === 'Erba')!
      .click();
    await fixture.whenStable();
    for (const [field, value] of [['quantity', '5'], ['totalPrice', '50']]) {
      const input = form.querySelector<HTMLInputElement>(`input[formControlName="${field}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    backend.expectOne('/api/substances/3/batches').flush({ id: 60, substanceId: 3 }, { status: 201, statusText: 'Created' });
    await settle();

    const restocked = substance(3, 'Erba');
    restocked.summary = {
      ...restocked.summary,
      stock: '5.000',
      stockBarMax: '5.000',
      stockBarSegments: [{ batchId: 60, name: null, remaining: '5.000', unitPrice: '10.000000' }],
    };
    backend.expectOne('/api/substances/3').flush(restocked);
    await fixture.whenStable();

    expect(document.querySelector('app-batch-form')).toBeNull();
    expect(segments()).toBe(1);
    expect(names()).toEqual(['Birra', 'Erba']);
  });

  it('edits a substance from its ⋮ menu: the same form, filled in; the card changes in its place', async () => {
    backend.expectOne('/api/settings').flush(settings);
    backend.expectOne('/api/substances').flush([substance(4, 'Birra'), substance(3, 'Erba')]);
    await fixture.whenStable();

    await menu('Birra', 'Edit');
    const form = document.querySelector('app-substance-form')!;
    const name = form.querySelector<HTMLInputElement>('input[formControlName="name"]')!;
    expect(name.value).toBe('Birra');
    name.value = 'Tabacco';
    name.dispatchEvent(new Event('input'));
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    const req = backend.expectOne('/api/substances/4');
    expect(req.request.method).toBe('PATCH');
    req.flush(substance(4, 'Tabacco'));
    await settle();

    expect(document.querySelector('app-substance-form')).toBeNull();
    expect(names()).toEqual(['Erba', 'Tabacco']);
  });

  it('deletes a substance from its ⋮ menu after asking; Cancel keeps it', async () => {
    backend.expectOne('/api/settings').flush(settings);
    backend.expectOne('/api/substances').flush([substance(4, 'Birra'), substance(3, 'Erba')]);
    await fixture.whenStable();
    const confirmButton = (label: string) =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('app-delete-substance-dialog button')).find(
        (b) => b.textContent?.trim() === label,
      )!;

    await menu('Birra', 'Delete');
    confirmButton('Cancel').click();
    await settle();
    backend.expectNone('/api/substances/4');
    expect(names()).toEqual(['Birra', 'Erba']);

    await menu('Birra', 'Delete');
    confirmButton('Delete').click();
    const req = backend.expectOne('/api/substances/4');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(document.querySelector('app-delete-substance-dialog')).toBeNull();
    expect(names()).toEqual(['Erba']);
  });

  describe('search', () => {
    const field = () => fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;

    /** Types in the search field, then waits for the pause after which the search starts. */
    async function search(typed: string): Promise<void> {
      field().value = typed;
      field().dispatchEvent(new Event('input'));
      await new Promise((resolve) => setTimeout(resolve, 400));
      await fixture.whenStable();
    }

    beforeEach(async () => {
      backend.expectOne('/api/settings').flush(settings);
      backend.expectOne('/api/substances').flush([substance(4, 'Birra'), substance(1, 'Caffè'), substance(3, 'Erba')]);
      await fixture.whenStable();
    });

    it('is a search bar: the elongated circle of styles.css, with what it looks for written inside it', () => {
      const bar = field().closest('mat-form-field')!;

      expect(bar.classList.contains('search-bar')).toBe(true);
      expect(field().placeholder).toBe('Search substances and batches');
      expect(field().getAttribute('aria-label')).toBe('Search substances and batches by name');
      expect(bar.querySelector('mat-label')).toBeNull();
    });

    it('searches as it is typed, after a pause: the text goes into the URL in place of the current entry, the API finds', async () => {
      const entries = history.length;
      await search(' per ');

      expect(TestBed.inject(Router).url).toBe('/?q=per');
      expect(history.length).toBe(entries);
      backend.expectOne('/api/substances?q=per').flush([substance(4, 'Birra')]); // it has a batch called Peroni
      await fixture.whenStable();
      expect(names()).toEqual(['Birra']);
      expect(field().value).toBe(' per '); // what is typed is not rewritten
    });

    it('waits for the typing to pause before it asks', async () => {
      // Two keys in a row, no pause between them (a real-time wait here was flaky under load: 50 ms
      // could stretch past the 300 ms pause).
      field().value = 'p';
      field().dispatchEvent(new Event('input'));
      backend.expectNone('/api/substances?q=p');
      await search('pe');

      backend.expectOne('/api/substances?q=pe').flush([]);
      backend.expectNone('/api/substances?q=p');
    });

    it('says when no name has the text, and the ✕ brings the whole list back at once', async () => {
      await search('zzz');
      backend.expectOne('/api/substances?q=zzz').flush([]);
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.empty')?.textContent?.trim()).toBe('No substance or batch with “zzz” in its name');

      fixture.nativeElement.querySelector('button[aria-label="Clear the search"]').click();
      await fixture.whenStable();
      expect(TestBed.inject(Router).url).toBe('/');
      backend.expectOne('/api/substances').flush([substance(4, 'Birra'), substance(3, 'Erba')]);
      await fixture.whenStable();
      expect(names()).toEqual(['Birra', 'Erba']);
      expect(field().value).toBe('');
      expect(fixture.nativeElement.querySelector('button[aria-label="Clear the search"]')).toBeNull();
    });

    it('shows in its field the search of the URL (a link, back), and what it finds', async () => {
      await TestBed.inject(Router).navigateByUrl('/?q=erb');
      backend.expectOne('/api/substances?q=erb').flush([substance(3, 'Erba')]);
      await fixture.whenStable();

      expect(field().value).toBe('erb');
      expect(names()).toEqual(['Erba']);
    });

    it('keeps the search in the URL when a substance is opened from the list found', async () => {
      await TestBed.inject(Router).navigateByUrl('/?q=erb');
      backend.expectOne('/api/substances?q=erb').flush([substance(3, 'Erba')]);
      await fixture.whenStable();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      fixture.nativeElement.querySelector('app-substance-card .last-purchase').click();

      expect(navigate).toHaveBeenCalledWith(['/substances', 3], { state: { fromList: true }, queryParamsHandling: 'preserve' });
    });
  });
});
