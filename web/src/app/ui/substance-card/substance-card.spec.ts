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
  stockBarSegments: [{ batchId: 7, name: null, quantity: '20.000', remaining: '8.000', unitPrice: '0.310000' }],
  lastBatch: {
    id: 8,
    name: null,
    occurredAt: '2026-09-20T10:00:00Z',
    quantity: '20.000',
    remaining: '0.000',
    totalPrice: '6.50',
    unitPrice: '0.325000',
  },
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
    expect(text(card.querySelector('.price-value'))).toBe('price: €0.33/sigaretta');
  });

  it('rounds half up on the decimal digits (1.005 → 1,01, where toFixed or Math.round give 1.00)', async () => {
    const lastBatch = { id: 1, name: null, occurredAt: '2026-09-01T10:00:00Z', quantity: '1.000', remaining: '1.000', totalPrice: '1.01', unitPrice: '1.005000' };
    const card = await render(substance(3, { lastBatch }));

    expect(text(card.querySelector('.price-value'))).toBe('price: €1.01/sigaretta');
  });

  it('switches to the average unit price and remembers the choice for that substance only', async () => {
    const toggle = (card: HTMLElement, label: string) =>
      Array.from(card.querySelectorAll<HTMLButtonElement>('.price-mode button')).find((b) => text(b) === label)!;

    let card = await render(cigarettes);
    toggle(card, 'average').click();
    await fixture.whenStable();
    expect(text(card.querySelector('.price-value'))).toBe('price: €0.31/sigaretta');

    card = await render(cigarettes); // e.g. after a reload
    expect(text(card.querySelector('.price-value'))).toBe('price: €0.31/sigaretta');
    expect(toggle(card, 'average').getAttribute('aria-checked')).toBe('true');

    card = await render({ ...cigarettes, id: 5 }); // another substance keeps the default
    expect(text(card.querySelector('.price-value'))).toBe('price: €0.33/sigaretta');
  });

  it('shows "—" when the chosen price does not exist (no batches; average with stock 0)', async () => {
    let card = await render(substance(4)); // no batches at all
    expect(text(card.querySelector('.price-value'))).toBe('price: —');
    localStorage.setItem('substance-tracker.price-mode.5', 'avg');
    card = await render(substance(5));
    expect(text(card.querySelector('.price-value'))).toBe('price: —');

    const finished = { id: 11, name: null, occurredAt: '2026-09-05T17:00:00Z', quantity: '6.000', remaining: '0.000', totalPrice: '7.20', unitPrice: '1.200000' };
    localStorage.setItem('substance-tracker.price-mode.6', 'avg');
    card = await render(substance(6, { lastBatch: finished, avgUnitPrice: null }));
    expect(text(card.querySelector('.price-value'))).toBe('price: —');
  });

  it('shows the date of the last purchase in the settings time zone; with no batches, the creation day', async () => {
    // 22:30 UTC on August 31 is 00:30 on September 1 in Europe/Rome
    const lastBatch = { id: 1, name: null, occurredAt: '2026-08-31T22:30:00Z', quantity: '1.000', remaining: '1.000', totalPrice: '7.20', unitPrice: '1.200000' };
    let card = await render(substance(1, { lastBatch }));
    expect(text(card.querySelector('.last-purchase'))).toBe('1 Sept 2026');

    card = await render(substance(4)); // created 2026-08-01T10:00:00Z
    expect(text(card.querySelector('.last-purchase'))).toBe('1 Aug 2026');
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
    expect(more.getAttribute('aria-label')).toBe('Actions for Sigarette');
    more.click();
    await fixture.whenStable();
    item('Edit').click();
    more.click();
    await fixture.whenStable();
    item('Delete').click();

    expect(asked).toEqual(['edit', 'remove']);
  });

  it('draws the stock bar of the summary on "average", labelled with the stock', async () => {
    localStorage.setItem('substance-tracker.price-mode.2', 'avg');
    const card = await render(cigarettes);

    const segments = card.querySelectorAll<HTMLElement>('app-stock-bar .segment');
    expect(segments.length).toBe(1);
    expect(parseFloat(segments[0].style.flexBasis)).toBeCloseTo(40, 6); // 8 of 20
    expect(card.querySelector('app-stock-bar .track')!.getAttribute('aria-label')).toBe('Stock: 8 sigaretta');
  });
});

describe('SubstanceCard: price or quantity, the selected batch or every one', () => {
  let fixture: ComponentFixture<SubstanceCard>;

  /** 2 g left of an older batch of 5, 6 of the last one, 10 at 8.93 a gram. */
  const weed = (id = 9): Substance => ({
    ...substance(id),
    name: 'Weed',
    unit: 'g',
    summary: {
      ...emptySummary,
      stock: '8.000',
      stockBarMax: '15.000',
      stockBarSegments: [
        { batchId: 20, name: null, quantity: '5.000', remaining: '2.000', unitPrice: '9.000000' },
        { batchId: 21, name: null, quantity: '10.000', remaining: '6.000', unitPrice: '8.930000' },
      ],
      lastBatch: {
        id: 21,
        name: null,
        occurredAt: '2026-10-06T10:00:00Z',
        quantity: '10.000',
        remaining: '6.000',
        totalPrice: '89.30',
        unitPrice: '8.930000',
      },
      avgUnitPrice: '8.947500',
    },
  });

  async function render(value: Substance): Promise<HTMLElement> {
    fixture = TestBed.createComponent(SubstanceCard);
    fixture.componentRef.setInput('substance', value);
    fixture.componentRef.setInput('settings', settings);
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const line = (card: HTMLElement) => card.querySelector<HTMLButtonElement>('button.price-value')!;
  const pills = (card: HTMLElement) => Array.from(card.querySelectorAll<HTMLButtonElement>('.price-mode button'));
  const pill = (card: HTMLElement, label: string) => pills(card).find((b) => text(b) === label)!;
  const segments = (card: HTMLElement) => Array.from(card.querySelectorAll<HTMLElement>('app-stock-bar .segment'));

  async function tap(element: HTMLElement): Promise<void> {
    element.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [SubstanceCard],
    }).compileComponents();
  });

  it('switches its line on a tap: the unit price, then the quantity left of what was bought, without opening the page', async () => {
    const card = await render(weed());
    const tapped: number[] = [];
    fixture.componentInstance.tapped.subscribe((id) => tapped.push(id));

    expect(text(line(card))).toBe('price: €8.93/g');
    expect(pills(card).map(text)).toEqual(['selected', 'average']);

    await tap(line(card));
    expect(text(line(card))).toBe('qty: 6/10 g'); // the selected batch: the last one, none tapped
    expect(pills(card).map(text)).toEqual(['selected', 'total']);
    expect(line(card).getAttribute('aria-label')).toBe('Quantity left 6/10 g. Show the price per unit');

    await tap(pill(card, 'total'));
    expect(text(line(card))).toBe('qty: 8/15 g'); // the stock, of the active batches' total

    await tap(line(card));
    expect(text(line(card))).toBe('price: €8.95/g'); // the average of the stock
    expect(tapped).toEqual([]);
  });

  it('remembers the line for that substance only', async () => {
    let card = await render(weed());
    await tap(line(card));

    card = await render(weed()); // e.g. after a reload
    expect(text(line(card))).toBe('qty: 6/10 g');

    card = await render(weed(10)); // another substance keeps the price
    expect(text(line(card))).toBe('price: €8.93/g');
  });

  it('on "selected" draws only the selected batch, out of what was bought of it; on the other side every batch', async () => {
    const card = await render(weed());
    const track = () => card.querySelector('app-stock-bar .track')!;

    let [older, last] = segments(card);
    expect(older.classList).toContain('away');
    expect(parseFloat(older.style.flexBasis)).toBe(0);
    expect(parseFloat(last.style.flexBasis)).toBeCloseTo(60, 6); // 6 of 10
    expect(track().getAttribute('aria-label')).toBe('Selected batch: 6 of 10 g left');

    await tap(pill(card, 'average'));
    [older, last] = segments(card);
    expect(older.classList).not.toContain('away');
    expect(parseFloat(older.style.flexBasis)).toBeCloseTo((2 / 15) * 100, 6);
    expect(parseFloat(last.style.flexBasis)).toBeCloseTo(40, 6); // 6 of 15
    expect(track().getAttribute('aria-label')).toBe('Stock: 8 g');
  });

  it('with the last batch finished and none tapped, says 0 left of it and empties the bar', async () => {
    const card = await render(cigarettes); // the last pack finished, 8 left of the older one
    await tap(line(card));

    expect(text(line(card))).toBe('qty: 0/20 sigaretta');
    expect(segments(card).every((segment) => segment.classList.contains('away'))).toBe(true);
  });

  it('says "—" with nothing bought', async () => {
    const card = await render(substance(4)); // no batches at all
    await tap(line(card));
    expect(text(line(card))).toBe('qty: —');

    await tap(pill(card, 'total'));
    expect(text(line(card))).toBe('qty: —');
  });

  it('a tap on a segment selects its batch: the pill turns to "selected", the line and the bar are its own, the page does not open', async () => {
    const card = await render(weed());
    const tapped: number[] = [];
    fixture.componentInstance.tapped.subscribe((id) => tapped.push(id));
    await tap(pill(card, 'average')); // every batch in the bar

    await tap(segments(card)[0].querySelector<HTMLElement>('.fill')!); // the older batch: 2 g left of 5, at 9.00
    expect(pill(card, 'selected').getAttribute('aria-checked')).toBe('true');
    expect(text(line(card))).toBe('price: €9.00/g');
    const [older, last] = segments(card);
    expect(parseFloat(older.style.flexBasis)).toBeCloseTo(40, 6); // 2 of 5
    expect(last.classList).toContain('away');

    await tap(line(card));
    expect(text(line(card))).toBe('qty: 2/5 g');
    expect(tapped).toEqual([]);
    expect(localStorage.getItem('substance-tracker.price-mode.9')).toBe('selected');
  });

  it('reads a "last" remembered before the rename as "selected"', async () => {
    localStorage.setItem('substance-tracker.price-mode.9', 'last');
    const card = await render(weed());

    expect(pill(card, 'selected').getAttribute('aria-checked')).toBe('true');
  });
});
