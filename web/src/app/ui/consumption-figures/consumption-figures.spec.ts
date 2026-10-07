import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Consumption } from '../../data/consumption';
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

describe('ConsumptionFigures', () => {
  let fixture: ComponentFixture<ConsumptionFigures>;
  /** Taps that reached what is around the figures (a card that opens its details). */
  let around: number;

  async function render(consumption: Consumption): Promise<HTMLElement> {
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
  const figure = (element: HTMLElement) => element.querySelector<HTMLButtonElement>('button.figure')!;
  const pill = (element: HTMLElement) => element.querySelector<HTMLButtonElement>('app-delta-pill button');

  async function tap(button: HTMLButtonElement): Promise<void> {
    button.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsumptionFigures],
    }).compileComponents();
  });

  it('shows how much and the change in quantity first, each with its word', async () => {
    const element = await render(coffee);

    expect(text(figure(element))).toBe('qty: 2 capsula');
    expect(text(pill(element))).toBe('qty -33.3%');
    expect(figure(element).getAttribute('aria-label')).toBe('Quantity 2 capsula. Show the price');
  });

  it('a tap on the figure or on the pill switches both, and never reaches the card around them', async () => {
    const element = await render(coffee);

    await tap(figure(element));
    expect(text(figure(element))).toBe('price: €0.64');
    expect(text(pill(element))).toBe('price -46.7%');
    expect(figure(element).getAttribute('aria-label')).toBe('Price €0.64. Show the quantity');

    await tap(pill(element)!);
    expect(text(figure(element))).toBe('qty: 2 capsula');
    expect(text(pill(element))).toBe('qty -33.3%');
    expect(around).toBe(0);
  });

  it('the first consumption has no pill: the figure still switches', async () => {
    const element = await render({ ...coffee, deltaQuantity: null, deltaUnitPrice: null, deltaCost: null });

    expect(pill(element)).toBeNull();
    await tap(figure(element));
    expect(text(figure(element))).toBe('price: €0.64');
  });
});
