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
  /** The price/qty toggle of the figures, the figure, and the change when there is one before it. */
  const toggle = (card: HTMLElement) => card.querySelector<HTMLButtonElement>('app-measure-toggle button');
  const value = (card: HTMLElement) => card.querySelector('.figure .value');
  const delta = (card: HTMLElement) => card.querySelector('.delta');
  const change = (card: HTMLElement) => card.querySelector('.delta .number');

  const colour = (id: number, kind: 'substance' | 'batch') => new IdentityColorPipe().transform(id, kind);

  it('shows when, what, from which batch, how much behind its toggle, its change and the note', async () => {
    const card = await render(coffee);

    expect(text(card.querySelector('.when'))).toBe('28 Sept 2026, 08:45'); // Europe/Rome
    expect(text(card.querySelector('.substance'))).toBe('Caffè');
    expect(card.querySelector<HTMLElement>('.head .dot')!.style.backgroundColor).toBe(colour(1, 'substance'));
    expect(text(card.querySelector('.source'))).toBe('Scorta grande');
    expect(card.querySelector<HTMLElement>('.source .dot')!.style.backgroundColor).toBe(colour(6, 'batch'));
    expect(text(toggle(card))).toBe('qty');
    expect(text(value(card))).toBe('2 capsula');
    expect(text(change(card))).toBe('-33.3%');
    expect(text(card.querySelector('.note'))).toBe('Before the train');
  });

  it('says "One-time" and its name instead of a batch', async () => {
    const card = await render(pint);

    expect(text(card.querySelector('.source'))).toBe('One-time · Pinta al pub');
    expect(card.querySelector('.source .dot')).toBeNull();
    expect(text(change(card))).toBe('-75%');
    expect(card.querySelector('.note')).toBeNull();

    const unnamed = await render({ ...pint, name: null });
    expect(text(unnamed.querySelector('.source'))).toBe('One-time');
  });

  it('calls a batch without a name "Unnamed batch"', async () => {
    const card = await render({ ...coffee, batchName: null });
    expect(text(card.querySelector('.source'))).toBe('Unnamed batch');
  });

  it('shows one change at a time: the toggle switches it to the price, without asking anything of the parent', async () => {
    const card = await render(coffee);
    const asked: string[] = [];
    fixture.componentInstance.details.subscribe(() => asked.push('details'));
    fixture.componentInstance.edit.subscribe(() => asked.push('edit'));
    fixture.componentInstance.remove.subscribe(() => asked.push('remove'));

    toggle(card)!.click();
    await fixture.whenStable();

    expect(text(change(card))).toBe('-46.7%');
    expect(asked).toEqual([]);
  });

  it('has no change for the first consumption', async () => {
    const first = await render({ ...coffee, deltaQuantity: null, deltaUnitPrice: null, deltaCost: null });
    expect(delta(first)).toBeNull();
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

  it('a tap on the card asks for its details, on its figures too; its ⋮ and its toggle do not (lenzi, 2026-10-01)', async () => {
    const card = await render(coffee);
    const asked: string[] = [];
    fixture.componentInstance.details.subscribe(() => asked.push('details'));

    card.querySelector<HTMLElement>('.when')!.click();
    card.querySelector<HTMLElement>('.figure .value')!.click(); // plain text since 2026-10-09: the toggle switches
    card.querySelector<HTMLElement>('.delta')!.click();
    card.querySelector<HTMLButtonElement>('button.more')!.click();
    await fixture.whenStable();
    toggle(card)!.click();
    // the keyboard way in: the substance's name is a button, its click reaches the card
    expect(card.querySelector('button.substance')).not.toBeNull();
    card.querySelector<HTMLButtonElement>('button.substance')!.click();

    expect(asked).toEqual(['details', 'details', 'details', 'details']);
  });

  it('compact: a tap asks for nothing', async () => {
    const card = await render(coffee, 'compact');
    const asked: string[] = [];
    fixture.componentInstance.details.subscribe(() => asked.push('details'));

    card.querySelector<HTMLElement>('.figure')!.click();

    expect(asked).toEqual([]);
  });

  it('compact: when, how much behind its toggle and its change, then the open button and the ⋮ (lenzi, 2026-10-03)', async () => {
    const card = await render(coffee, 'compact');

    expect(text(card.querySelector('.when'))).toBe('28 Sept 2026, 08:45');
    expect(text(toggle(card))).toBe('qty');
    expect(text(value(card))).toBe('2 capsula');
    expect(text(change(card))).toBe('-33.3%');
    expect(card.querySelector('.substance')).toBeNull();
    expect(card.querySelector('.source')).toBeNull();
    expect(card.querySelector('.note')).toBeNull();
    const open = card.querySelector<HTMLButtonElement>('.actions button.open')!;
    expect(text(open)).toBe('open_in_new');
    expect(open.getAttribute('aria-label')).toBe('Open the consumption of 28 Sept 2026, 08:45 in the consumptions page');
    expect(card.querySelector('.actions button.more')).not.toBeNull();
    // a compact card is not tapped as a whole: only its buttons do something
    expect(card.querySelector('mat-card')!.classList).not.toContain('tappable');
  });

  it('compact: the open button and the ⋮ menu (details, edit, delete) ask the parent', async () => {
    const card = await render(coffee, 'compact');
    const said: string[] = [];
    fixture.componentInstance.open.subscribe(() => said.push('open'));
    fixture.componentInstance.details.subscribe(() => said.push('details'));
    fixture.componentInstance.edit.subscribe(() => said.push('edit'));
    fixture.componentInstance.remove.subscribe(() => said.push('remove'));

    card.querySelector<HTMLButtonElement>('.actions button.open')!.click();
    for (const label of ['Details', 'Edit', 'Delete']) {
      card.querySelector<HTMLButtonElement>('.actions button.more')!.click();
      await fixture.whenStable();
      Array.from(document.querySelectorAll<HTMLButtonElement>('.mat-mdc-menu-panel button[mat-menu-item]'))
        .find((b) => b.textContent?.includes(label))!
        .click();
      await fixture.whenStable();
    }

    expect(said).toEqual(['open', 'details', 'edit', 'remove']);
  });

  it('compact: has no change for the first consumption, and still says when and how much', async () => {
    const first = await render({ ...coffee, deltaQuantity: null, deltaUnitPrice: null, deltaCost: null }, 'compact');

    expect(delta(first)).toBeNull();
    expect(text(first.querySelector('.when'))).toBe('28 Sept 2026, 08:45');
    expect(text(value(first))).toBe('2 capsula');
  });

  it('a To fix consumption of the queue: its tag and reason, no toggle, no change, no cost, no details; its own ⋮ menu', async () => {
    fixture = TestBed.createComponent(ConsumptionCard);
    fixture.componentRef.setInput('consumption', { ...coffee, cost: '' });
    fixture.componentRef.setInput('settings', settings);
    fixture.componentRef.setInput('queued', 'to-fix');
    fixture.componentRef.setInput('reason', 'Batch 8 is finished');
    await fixture.whenStable();
    const card = fixture.nativeElement as HTMLElement;
    const asked: unknown[] = [];
    fixture.componentInstance.details.subscribe(() => asked.push('details'));
    fixture.componentInstance.fix.subscribe((oneTime) => asked.push(oneTime ? 'one-time' : 'another batch'));
    fixture.componentInstance.discard.subscribe(() => asked.push('discard'));

    expect(text(card.querySelector('.queue-tag .tag'))).toBe('To fix');
    expect(text(card.querySelector('.queue-tag .reason'))).toBe('Batch 8 is finished');
    expect(toggle(card)).toBeNull();
    expect(delta(card)).toBeNull();
    expect(text(card.querySelector('.amount'))).not.toContain('€');
    card.querySelector<HTMLElement>('mat-card')!.click();
    expect(asked).toEqual([]);

    card.querySelector<HTMLButtonElement>('button.more')!.click();
    await fixture.whenStable();
    const items = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.mat-mdc-menu-item'));
    expect(items().map((b) => text(b))).toEqual(['inventory_2Choose another batch', 'shopping_bagMake it one-time', 'deleteDiscard']);
    items()[1]!.click();
    expect(asked).toEqual(['one-time']);
  });

  it('a Pending consumption: the tag, and only Discard', async () => {
    fixture = TestBed.createComponent(ConsumptionCard);
    fixture.componentRef.setInput('consumption', { ...coffee, cost: '' });
    fixture.componentRef.setInput('settings', settings);
    fixture.componentRef.setInput('queued', 'pending');
    await fixture.whenStable();
    const card = fixture.nativeElement as HTMLElement;
    expect(text(card.querySelector('.queue-tag'))).toBe('Pending');
    card.querySelector<HTMLButtonElement>('button.more')!.click();
    await fixture.whenStable();
    expect(Array.from(document.querySelectorAll('.mat-mdc-menu-item')).map((b) => text(b))).toEqual(['deleteDiscard']);
  });
});

describe('ConsumptionCard: quantity or price', () => {
  let fixture: ComponentFixture<ConsumptionCard>;

  async function render(consumption: Consumption, variant: 'full' | 'compact'): Promise<HTMLElement> {
    fixture = TestBed.createComponent(ConsumptionCard);
    fixture.componentRef.setInput('consumption', consumption);
    fixture.componentRef.setInput('settings', settings);
    fixture.componentRef.setInput('variant', variant);
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const toggle = (card: HTMLElement) => card.querySelector<HTMLButtonElement>('app-measure-toggle button');
  const value = (card: HTMLElement) => card.querySelector('.figure .value');
  const change = (card: HTMLElement) => card.querySelector('.delta .number');

  async function tap(element: HTMLElement): Promise<void> {
    element.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsumptionCard],
    }).compileComponents();
  });

  it('compact: the toggle on the left switches the figure and its change together', async () => {
    const card = await render(coffee, 'compact');

    expect(text(toggle(card))).toBe('qty');
    expect(text(value(card))).toBe('2 capsula');
    expect(text(change(card))).toBe('-33.3%');

    await tap(toggle(card)!);
    expect(text(toggle(card))).toBe('price');
    expect(text(value(card))).toBe('€0.64');
    expect(text(change(card))).toBe('-46.7%');

    await tap(toggle(card)!);
    expect(text(value(card))).toBe('2 capsula');
    expect(text(change(card))).toBe('-33.3%');
  });

  it('compact: the first consumption, with no change, still switches its figure', async () => {
    const card = await render({ ...coffee, deltaQuantity: null, deltaUnitPrice: null, deltaCost: null }, 'compact');

    expect(change(card)).toBeNull();
    await tap(toggle(card)!);
    expect(text(value(card))).toBe('€0.64');
  });

  it('full: the same toggle, which does not open the details', async () => {
    const card = await render(coffee, 'full');
    const asked: string[] = [];
    fixture.componentInstance.details.subscribe(() => asked.push('details'));

    await tap(toggle(card)!);
    expect(text(value(card))).toBe('€0.64');
    expect(text(change(card))).toBe('-46.7%');
    expect(asked).toEqual([]);
  });
});
