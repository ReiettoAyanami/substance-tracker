import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Consumption } from '../../data/consumption';
import { OneTimeConsumption } from '../../data/one-time';
import { DeltaPill } from './delta-pill';

/** A consumption of a batch, as the consumptions list gives it: −33.3 % quantity, −46.7 % price. */
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

describe('DeltaPill', () => {
  const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function render(consumption: Consumption | OneTimeConsumption): Promise<ComponentFixture<DeltaPill>> {
    const fixture = TestBed.createComponent(DeltaPill);
    fixture.componentRef.setInput('consumption', consumption);
    await fixture.whenStable();
    return fixture;
  }

  const pillOf = (fixture: ComponentFixture<DeltaPill>) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.pill');

  async function tap(fixture: ComponentFixture<DeltaPill>): Promise<void> {
    pillOf(fixture)!.click();
    await fixture.whenStable();
  }

  it('shows the change in quantity from the previous consumption, in a pill', async () => {
    const fixture = await render(coffee);

    expect(text(pillOf(fixture))).toBe('quantity -33.3%');
    expect(pillOf(fixture)!.getAttribute('aria-label')).toBe(
      'quantity -33.3%: the change from the previous consumption. Show the change in price',
    );
  });

  it('shows the change in price once tapped, and the quantity again at the next tap', async () => {
    const fixture = await render(coffee);

    await tap(fixture);
    expect(text(pillOf(fixture))).toBe('price -46.7%'); // what it cost against what the previous one cost
    expect(pillOf(fixture)!.getAttribute('aria-label')).toBe(
      'price -46.7%: the change from the previous consumption. Show the change in quantity',
    );

    await tap(fixture);
    expect(text(pillOf(fixture))).toBe('quantity -33.3%');
  });

  it('compares the price with what the previous consumption cost, not with its price per unit', async () => {
    // same unit price as the one before (a delta of 0 on it), three times the quantity: three times the price
    const fixture = await render({ ...coffee, deltaQuantity: '2.0000', deltaUnitPrice: '0.0000', deltaCost: '2.0000' });

    await tap(fixture);
    expect(text(pillOf(fixture))).toBe('price +200%');
  });

  it('does the same for a one-time consumption, as its one-time list gives it', async () => {
    const fixture = await render(pint);
    expect(text(pillOf(fixture))).toBe('quantity -75%');

    await tap(fixture);
    expect(text(pillOf(fixture))).toBe('price +4.2%'); // what was paid against what the previous one cost
  });

  it('switches only itself: every card has its own pill', async () => {
    const first = await render(coffee);
    const second = await render(pint);

    await tap(first);
    await second.whenStable();

    expect(text(pillOf(first))).toBe('price -46.7%');
    expect(text(pillOf(second))).toBe('quantity -75%');
  });

  it('signs the change, and says "0%" when nothing changed', async () => {
    expect(text(pillOf(await render({ ...coffee, deltaQuantity: '2.0000' })))).toBe('quantity +200%');
    expect(text(pillOf(await render({ ...coffee, deltaQuantity: '0.0000' })))).toBe('quantity 0%');
  });

  it('is not there for the first consumption: nothing to compare it with', async () => {
    const fixture = await render({ ...coffee, deltaQuantity: null, deltaUnitPrice: null, deltaCost: null });
    expect(pillOf(fixture)).toBeNull();
  });

  it('says "qty" when asked for the short word, and the whole word to a screen reader', async () => {
    const fixture = await render(coffee);
    fixture.componentRef.setInput('short', true);
    await fixture.whenStable();

    expect(text(pillOf(fixture))).toBe('qty -33.3%');
    expect(pillOf(fixture)!.getAttribute('aria-label')).toBe(
      'qty -33.3%: the change in quantity from the previous consumption. Show the change in price',
    );

    await tap(fixture);
    expect(text(pillOf(fixture))).toBe('price -46.7%'); // the price keeps its word
  });

  it('shows the measure it is given, and says when a tap changes it', async () => {
    const fixture = await render(coffee);
    const changes: string[] = [];
    fixture.componentInstance.measure.subscribe((measure) => changes.push(measure));

    fixture.componentRef.setInput('measure', 'price');
    await fixture.whenStable();
    expect(text(pillOf(fixture))).toBe('price -46.7%');

    await tap(fixture);
    expect(text(pillOf(fixture))).toBe('quantity -33.3%');
    expect(changes).toEqual(['quantity']);
  });

  it('has no change in price after a free one: it says so, and still switches back', async () => {
    const fixture = await render({ ...coffee, deltaQuantity: '3.0000', deltaUnitPrice: null, deltaCost: null });
    expect(text(pillOf(fixture))).toBe('quantity +300%');

    await tap(fixture);
    expect(text(pillOf(fixture))).toBe('price —');
    expect(pillOf(fixture)!.getAttribute('aria-label')).toBe(
      'price: no change to show, the previous consumption was free. Show the change in quantity',
    );

    await tap(fixture);
    expect(text(pillOf(fixture))).toBe('quantity +300%');
  });
});
