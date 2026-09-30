import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Consumption } from '../../data/consumption';
import { Settings } from '../../data/settings';
import { IdentityColorPipe } from '../identity-color-pipe';
import { ConsumptionCard } from './consumption-card';

const settings: Settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };

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
  note: 'Before the train',
  deltaQuantity: '-0.3333',
  deltaUnitPrice: '-0.2000',
  deltaCost: '-0.4667',
};

const pint: Consumption = {
  ...coffee,
  type: 'one_time',
  id: 1,
  substanceId: 4,
  substanceName: 'Birra',
  unit: 'bottiglia',
  batchId: null,
  batchName: null,
  name: 'Pinta al pub',
  occurredAt: '2026-09-13T21:00:00Z',
  quantity: '1.000',
  unitPrice: '5.000000',
  cost: '5.00',
  note: null,
  deltaQuantity: '-0.7500',
  deltaUnitPrice: '3.1667',
  deltaCost: '0.0417',
};

describe('ConsumptionCard', () => {
  let fixture: ComponentFixture<ConsumptionCard>;

  async function render(consumption: Consumption, variant?: 'full' | 'compact'): Promise<HTMLElement> {
    fixture = TestBed.createComponent(ConsumptionCard);
    fixture.componentRef.setInput('consumption', consumption);
    fixture.componentRef.setInput('settings', settings);
    if (variant) fixture.componentRef.setInput('variant', variant);
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  /** The delta pill of a card: a button, when the consumption has one before it. */
  const pill = (card: HTMLElement) => card.querySelector<HTMLButtonElement>('app-delta-pill button');

  const colour = (id: number, kind: 'substance' | 'batch') => new IdentityColorPipe().transform(id, kind);

  it('shows when, what, from which batch, how much and at what cost, the delta pill and the note', async () => {
    const card = await render(coffee);

    expect(text(card.querySelector('.when'))).toBe('28 Sept 2026, 08:45'); // Europe/Rome
    expect(text(card.querySelector('.substance'))).toBe('Caffè');
    expect(card.querySelector<HTMLElement>('.head .dot')!.style.backgroundColor).toBe(colour(1, 'substance'));
    expect(text(card.querySelector('.source'))).toBe('Scorta grande');
    expect(card.querySelector<HTMLElement>('.source .dot')!.style.backgroundColor).toBe(colour(6, 'batch'));
    expect(text(card.querySelector('.amount'))).toBe('2 capsula · €0.64');
    expect(text(pill(card))).toBe('quantity -33.3%');
    expect(text(card.querySelector('.note'))).toBe('Before the train');
  });

  it('says "One-time" and its name instead of a batch', async () => {
    const card = await render(pint);

    expect(text(card.querySelector('.source'))).toBe('One-time · Pinta al pub');
    expect(card.querySelector('.source .dot')).toBeNull();
    expect(text(pill(card))).toBe('quantity -75%');
    expect(card.querySelector('.note')).toBeNull();

    const unnamed = await render({ ...pint, name: null });
    expect(text(unnamed.querySelector('.source'))).toBe('One-time');
  });

  it('calls a batch without a name "Unnamed batch"', async () => {
    const card = await render({ ...coffee, batchName: null });
    expect(text(card.querySelector('.source'))).toBe('Unnamed batch');
  });

  it('shows one change at a time: a tap on the pill switches it to the price, without asking anything of the parent', async () => {
    const card = await render(coffee);
    const asked: string[] = [];
    fixture.componentInstance.edit.subscribe(() => asked.push('edit'));
    fixture.componentInstance.remove.subscribe(() => asked.push('remove'));

    pill(card)!.click();
    await fixture.whenStable();

    expect(text(pill(card))).toBe('price -46.7%');
    expect(asked).toEqual([]);
  });

  it('has no pill for the first consumption', async () => {
    const first = await render({ ...coffee, deltaQuantity: null, deltaUnitPrice: null, deltaCost: null });
    expect(pill(first)).toBeNull();
  });

  it('asks for its details, to edit it or to delete it from its ⋮ menu', async () => {
    const card = await render(coffee);
    const asked: string[] = [];
    fixture.componentInstance.details.subscribe(() => asked.push('details'));
    fixture.componentInstance.edit.subscribe(() => asked.push('edit'));
    fixture.componentInstance.remove.subscribe(() => asked.push('remove'));
    const item = (label: string) =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('.mat-mdc-menu-item')).find((b) => text(b).endsWith(label))!;

    const more = card.querySelector<HTMLButtonElement>('button.more')!;
    expect(more.getAttribute('aria-label')).toBe('Actions for the consumption of 28 Sept 2026, 08:45');
    more.click();
    await fixture.whenStable();
    expect(Array.from(document.querySelectorAll('.mat-mdc-menu-item')).map((b) => text(b))).toEqual([
      'insightsDetails',
      'editEdit',
      'deleteDelete',
    ]);
    item('Details').click();
    more.click();
    await fixture.whenStable();
    item('Edit').click();
    more.click();
    await fixture.whenStable();
    item('Delete').click();

    expect(asked).toEqual(['details', 'edit', 'remove']);
  });

  it('compact: only when, how much, the cost and the delta, with no menu', async () => {
    const card = await render(coffee, 'compact');

    expect(text(card.querySelector('.when'))).toBe('28 Sept 2026, 08:45');
    expect(text(card.querySelector('.amount'))).toBe('2 capsula · €0.64');
    expect(text(pill(card))).toBe('quantity -33.3%');
    expect(card.querySelector('.substance')).toBeNull();
    expect(card.querySelector('.source')).toBeNull();
    expect(card.querySelector('.note')).toBeNull();
    expect(card.querySelector('button.more')).toBeNull();
  });

  it('compact: has no pill for the first consumption, and still says when, how much and the cost', async () => {
    const first = await render({ ...coffee, deltaQuantity: null, deltaUnitPrice: null, deltaCost: null }, 'compact');

    expect(pill(first)).toBeNull();
    expect(text(first.querySelector('.when'))).toBe('28 Sept 2026, 08:45');
    expect(text(first.querySelector('.amount'))).toBe('2 capsula · €0.64');
  });
});
