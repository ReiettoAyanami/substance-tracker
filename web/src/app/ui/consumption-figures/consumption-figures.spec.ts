import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Consumption } from '../../data/consumption';
import { OneTimeConsumption } from '../../data/one-time';
import { ConsumptionFigures } from './consumption-figures';

/** 2 capsules of the big stock for 0.64, after 3 for 1.20: −33.3 % quantity, −46.7 % price. */
const coffee: Consumption = {
  type: 'consumption',
  id: 39,
  substanceId: 1,
  substanceName: 'Caffè',
  unit: 'capsula',
  batchId: 6,
  batchName: 'Scorta grande',
  name: null,
  occurredAt: '2026-09-28T06:45:00Z',
  quantity: '2.000',
  unitPrice: '0.320000',
  cost: '0.64',
  note: null,
  deltaQuantity: '-0.3333',
  deltaUnitPrice: '-0.2000',
  deltaCost: '-0.4667',
};

/** A one-time consumption, as the one-time list of its substance gives it: −75 % quantity, +4.2 % price. */
const pint: OneTimeConsumption = {
  type: 'one_time',
  id: 1,
  substanceId: 4,
  name: 'Pinta al pub',
  occurredAt: '2026-09-13T21:00:00Z',
  quantity: '1.000',
  totalPrice: '5.00',
  cost: '5.00',
  note: null,
  clientRef: null,
  createdAt: '2026-09-13T21:05:00Z',
  deltaQuantity: '-0.7500',
  deltaUnitPrice: '3.1667',
  deltaCost: '0.0417',
};

describe('ConsumptionFigures', () => {
  let fixture: ComponentFixture<ConsumptionFigures>;
  /** Taps that reached what is around the figures (a card that opens its details). */
  let around: number;

  async function render(consumption: Consumption | OneTimeConsumption): Promise<HTMLElement> {
    fixture = TestBed.createComponent(ConsumptionFigures);
    fixture.componentRef.setInput('consumption', consumption);
    fixture.componentRef.setInput('quantity', '2 capsula');
    fixture.componentRef.setInput('price', '€0.64');
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    around = 0;
    element.parentElement?.addEventListener('click', () => around++);
    return element;
  }

  const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const toggle = (element: HTMLElement) => element.querySelector<HTMLButtonElement>('app-measure-toggle button')!;
  const value = (element: HTMLElement) => text(element.querySelector('.value'));
  const delta = (element: HTMLElement) => element.querySelector<HTMLElement>('.delta');
  /** The change as it reads, without the triangle's name. */
  const change = (element: HTMLElement) => text(delta(element)?.querySelector('.change .number') ?? null);
  const arrow = (element: HTMLElement) => text(delta(element)?.querySelector('mat-icon.arrow') ?? null);

  async function tap(button: HTMLButtonElement): Promise<void> {
    button.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsumptionFigures],
    }).compileComponents();
  });

  it('shows the toggle, how much with no word of its own, and its change, the quantity first', async () => {
    const element = await render(coffee);

    expect(text(toggle(element))).toBe('qty');
    expect(value(element)).toBe('2 capsula');
    expect(text(delta(element)!.querySelector('.label'))).toBe('delta:');
    expect(change(element)).toBe('-33.3%');
    // The toggle on the left, then the figure, then the change: the order of the line.
    expect(Array.from(element.children).map((child) => child.className)).toEqual(['figure', 'delta down']);
  });

  it('the toggle switches the figure and the change together, and its tap never reaches the card', async () => {
    const element = await render(coffee);

    await tap(toggle(element));
    expect(text(toggle(element))).toBe('price');
    expect(value(element)).toBe('€0.64');
    expect(change(element)).toBe('-46.7%'); // what it cost against what the previous one cost

    await tap(toggle(element));
    expect(value(element)).toBe('2 capsula');
    expect(change(element)).toBe('-33.3%');
    expect(around).toBe(0);
  });

  it('a fall is green with a triangle down, a rise red with a triangle up, no change neither', async () => {
    let element = await render(coffee);
    expect(delta(element)!.classList).toContain('down');
    expect(arrow(element)).toBe('arrow_drop_down');

    element = await render({ ...coffee, deltaQuantity: '2.0000' });
    expect(change(element)).toBe('+200%');
    expect(delta(element)!.classList).toContain('up');
    expect(arrow(element)).toBe('arrow_drop_up');

    for (const ratio of ['0.0000', '-0.0004']) {
      // -0.04 % is shown as 0 %: it goes the way it reads, nowhere
      element = await render({ ...coffee, deltaQuantity: ratio });
      expect(change(element)).toBe('0%');
      expect(delta(element)!.classList).not.toContain('up');
      expect(delta(element)!.classList).not.toContain('down');
      expect(arrow(element)).toBe('');
    }
  });

  it('the colour and the triangle follow the measure shown', async () => {
    const element = await render(pint); // less than the one before, but it cost more

    expect(change(element)).toBe('-75%');
    expect(delta(element)!.classList).toContain('down');

    await tap(toggle(element));
    expect(change(element)).toBe('+4.2%'); // what was paid against what the previous one cost
    expect(delta(element)!.classList).toContain('up');
    expect(arrow(element)).toBe('arrow_drop_up');
  });

  it('compares the price with what the previous consumption cost, not with its price per unit', async () => {
    // same unit price as the one before (a delta of 0 on it), three times the quantity: three times the price
    const element = await render({ ...coffee, deltaQuantity: '2.0000', deltaUnitPrice: '0.0000', deltaCost: '2.0000' });

    await tap(toggle(element));
    expect(change(element)).toBe('+200%');
  });

  it('has no change after a free consumption: "—", in no colour, and says why', async () => {
    const element = await render({ ...coffee, deltaQuantity: '3.0000', deltaUnitPrice: null, deltaCost: null });
    expect(change(element)).toBe('+300%');

    await tap(toggle(element));
    expect(change(element)).toBe('—');
    expect(delta(element)!.className).toBe('delta');
    expect(delta(element)!.querySelector('.change')!.getAttribute('title')).toBe(
      'no change in price: the previous consumption was free',
    );
  });

  it('the first consumption has no change: the toggle still switches the figure', async () => {
    const element = await render({ ...coffee, deltaQuantity: null, deltaUnitPrice: null, deltaCost: null });

    expect(delta(element)).toBeNull();
    await tap(toggle(element));
    expect(value(element)).toBe('€0.64');
  });

  it('switches only itself: every consumption has its own toggle', async () => {
    const first = await render(coffee);
    const firstFixture = fixture;
    const second = await render(pint);

    await tap(toggle(second));
    await firstFixture.whenStable();

    expect(value(first)).toBe('2 capsula');
    expect(value(second)).toBe('€0.64');
  });
});
