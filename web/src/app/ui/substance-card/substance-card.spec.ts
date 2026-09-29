import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Settings } from '../../data/settings';
import { CardSummary, Substance } from '../../data/substance';
import { IdentityColorPipe } from '../identity-color-pipe';
import { SubstanceCard } from './substance-card';

const settings: Settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };

const emptySummary: CardSummary = {
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
};

function substance(id: number, summary: Partial<CardSummary> = {}): Substance {
  return {
    id,
    name: 'Sigarette',
    unit: 'sigaretta',
    refillQuantity: '20.000',
    archived: false,
    archivedAt: null,
    createdAt: '2026-08-01T10:00:00Z',
    summary: { ...emptySummary, ...summary },
  };
}

/** The last pack (6.50 for 20) is finished; the older one (6.20 for 20) has 8 left. */
const cigarettes = substance(2, {
  stock: '8.000',
  stockBarMax: '20.000',
  stockBarSegments: [{ batchId: 7, name: null, remaining: '8.000', unitPrice: '0.310000' }],
  lastBatch: { id: 8, name: null, occurredAt: '2026-09-20T10:00:00Z', totalPrice: '6.50', unitPrice: '0.325000' },
  avgUnitPrice: '0.310000',
});

describe('SubstanceCard', () => {
  let fixture: ComponentFixture<SubstanceCard>;

  async function render(value: Substance): Promise<HTMLElement> {
    fixture = TestBed.createComponent(SubstanceCard);
    fixture.componentRef.setInput('substance', value);
    fixture.componentRef.setInput('settings', settings);
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  /** Visible text with non-breaking spaces as plain spaces. */
  const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [SubstanceCard],
    }).compileComponents();
  });

  it('shows the identity dot, the name and the last unit price rounded to cents, per unit', async () => {
    const card = await render(cigarettes);

    const dot: HTMLElement = card.querySelector('.dot')!;
    expect(dot.style.backgroundColor).toBe(new IdentityColorPipe().transform(2, 'substance'));
    expect(text(card.querySelector('.name'))).toBe('Sigarette');
    expect(text(card.querySelector('.price-value'))).toBe('0,33 €/sigaretta');
  });

  it('rounds half up on the decimal digits (1.005 → 1,01, where toFixed or Math.round give 1.00)', async () => {
    const lastBatch = { id: 1, name: null, occurredAt: '2026-09-01T10:00:00Z', totalPrice: '1.01', unitPrice: '1.005000' };
    const card = await render(substance(3, { lastBatch }));

    expect(text(card.querySelector('.price-value'))).toBe('1,01 €/sigaretta');
  });

  it('switches to the average unit price and remembers the choice for that substance only', async () => {
    const toggle = (card: HTMLElement, label: string) =>
      Array.from(card.querySelectorAll<HTMLButtonElement>('.price-mode button')).find((b) => text(b) === label)!;

    let card = await render(cigarettes);
    toggle(card, 'medio').click();
    await fixture.whenStable();
    expect(text(card.querySelector('.price-value'))).toBe('0,31 €/sigaretta');

    card = await render(cigarettes); // e.g. after a reload
    expect(text(card.querySelector('.price-value'))).toBe('0,31 €/sigaretta');
    expect(toggle(card, 'medio').getAttribute('aria-checked')).toBe('true');

    card = await render({ ...cigarettes, id: 5 }); // another substance keeps the default
    expect(text(card.querySelector('.price-value'))).toBe('0,33 €/sigaretta');
  });

  it('shows "—" when the chosen price does not exist (no batches; average with stock 0)', async () => {
    let card = await render(substance(4)); // no batches at all
    expect(text(card.querySelector('.price-value'))).toBe('—');
    localStorage.setItem('substance-tracker.price-mode.5', 'avg');
    card = await render(substance(5));
    expect(text(card.querySelector('.price-value'))).toBe('—');

    const finished = { id: 11, name: null, occurredAt: '2026-09-05T17:00:00Z', totalPrice: '7.20', unitPrice: '1.200000' };
    localStorage.setItem('substance-tracker.price-mode.6', 'avg');
    card = await render(substance(6, { lastBatch: finished, avgUnitPrice: null }));
    expect(text(card.querySelector('.price-value'))).toBe('—');
  });

  it('shows the date of the last purchase in the settings time zone; with no batches, the creation day', async () => {
    // 22:30 UTC on August 31 is 00:30 on September 1 in Europe/Rome
    const lastBatch = { id: 1, name: null, occurredAt: '2026-08-31T22:30:00Z', totalPrice: '7.20', unitPrice: '1.200000' };
    let card = await render(substance(1, { lastBatch }));
    expect(text(card.querySelector('.last-purchase'))).toBe('1 set 2026');

    card = await render(substance(4)); // created 2026-08-01T10:00:00Z
    expect(text(card.querySelector('.last-purchase'))).toBe('1 ago 2026');
  });

  it('is tapped anywhere (and via its name button from the keyboard), but not through the toggle', async () => {
    const card = await render(cigarettes);
    const tapped: number[] = [];
    fixture.componentInstance.tapped.subscribe((id) => tapped.push(id));

    card.querySelector<HTMLElement>('.last-purchase')!.click();
    card.querySelector<HTMLButtonElement>('button.name')!.click();
    expect(tapped).toEqual([2, 2]);

    card.querySelector<HTMLButtonElement>('.price-mode button')!.click();
    expect(tapped).toEqual([2, 2]);
  });

  it('asks to edit or delete from its ⋮ menu, without opening the page', async () => {
    const card = await render(cigarettes);
    const asked: string[] = [];
    fixture.componentInstance.tapped.subscribe(() => asked.push('tapped'));
    fixture.componentInstance.edit.subscribe(() => asked.push('edit'));
    fixture.componentInstance.remove.subscribe(() => asked.push('remove'));
    const item = (label: string) =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('.mat-mdc-menu-item')).find(
        (b) => text(b).endsWith(label),
      )!;

    const more = card.querySelector<HTMLButtonElement>('button.more')!;
    expect(more.getAttribute('aria-label')).toBe('Azioni su Sigarette');
    more.click();
    await fixture.whenStable();
    item('Modifica').click();
    more.click();
    await fixture.whenStable();
    item('Elimina').click();

    expect(asked).toEqual(['edit', 'remove']);
  });

  it('draws the stock bar of the summary, labelled with the stock', async () => {
    const card = await render(cigarettes);

    const segments = card.querySelectorAll<HTMLElement>('app-stock-bar .segment');
    expect(segments.length).toBe(1);
    expect(parseFloat(segments[0].style.flexBasis)).toBeCloseTo(40, 6); // 8 of 20
    expect(card.querySelector('app-stock-bar .track')!.getAttribute('aria-label')).toBe('Scorta: 8 sigaretta');
  });
});
