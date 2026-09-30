import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

import { MetricDefinition } from '../../data/metric';
import { ViewItem } from '../../data/view-item';
import { ViewItemList } from './view-item-list';

const metric = (key: string, label: string): MetricDefinition => ({
  key,
  scope: 'substance',
  label,
  unit: 'quantity',
  scales: [],
  period: true,
  description: `What ${label} is.`,
});

const metrics = [metric('substance.consumed', 'Consumed'), metric('substance.pace', 'Pace'), metric('substance.cost', 'Cost')];

const item = (id: number, key: string): ViewItem => ({
  id,
  surface: 'substance',
  section: null,
  position: id,
  metric: key,
  chart: null,
  scale: null,
  createdAt: '',
});

describe('ViewItemList', () => {
  let fixture: ComponentFixture<ViewItemList>;
  let events: unknown[];

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const texts = (selector: string) => Array.from(element().querySelectorAll(selector)).map(text);
  const buttons = (selector: string) => Array.from(element().querySelectorAll<HTMLButtonElement>(selector));

  async function render(items: ViewItem[], busy = false): Promise<void> {
    fixture = TestBed.createComponent(ViewItemList);
    fixture.componentRef.setInput('items', items);
    fixture.componentRef.setInput('metrics', metrics);
    fixture.componentRef.setInput('busy', busy);
    events = [];
    fixture.componentInstance.add.subscribe((key) => events.push(['add', key]));
    fixture.componentInstance.remove.subscribe((i) => events.push(['remove', i.id]));
    fixture.componentInstance.move.subscribe(({ item: i, by }) => events.push(['move', i.id, by]));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewItemList],
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    }).compileComponents();
  });

  it('lists what the place shows, each with its description, in order', async () => {
    await render([item(5, 'substance.cost'), item(2, 'substance.consumed'), item(9, 'substance.retired')]);

    expect(texts('.item .label')).toEqual(['Cost', 'Consumed', 'substance.retired']);
    expect(texts('.item .description')).toEqual(['What Cost is.', 'What Consumed is.', 'Not in the catalog any more: remove it.']);
  });

  it('moves up, down and removes, the first not up and the last not down', async () => {
    await render([item(5, 'substance.cost'), item(2, 'substance.consumed')]);

    expect(buttons('.up').map((b) => b.disabled)).toEqual([true, false]);
    expect(buttons('.down').map((b) => b.disabled)).toEqual([false, true]);
    buttons('.down')[0]!.click();
    buttons('.up')[1]!.click();
    buttons('.remove')[1]!.click();

    expect(events).toEqual([
      ['move', 5, 1],
      ['move', 2, -1],
      ['remove', 2],
    ]);
  });

  it('adds one of the metrics it does not show yet, each option with its description', async () => {
    await render([item(5, 'substance.cost')]);
    element().querySelector<HTMLElement>('.add mat-select')!.click();
    await fixture.whenStable();
    const options = Array.from(document.querySelectorAll<HTMLElement>('mat-option'));
    expect(options.map(text)).toEqual(['Consumed What Consumed is.', 'Pace What Pace is.']);

    options[1]!.click();
    await fixture.whenStable();
    expect(events).toEqual([['add', 'substance.pace']]);
  });

  it('while a write runs, nothing can be asked; with everything shown, nothing to add', async () => {
    await render([item(1, 'substance.consumed'), item(2, 'substance.pace'), item(3, 'substance.cost')], true);

    expect(buttons('button').every((b) => b.disabled)).toBe(true);
    expect(element().querySelector('.add')).toBeNull();
  });

  it('says when nothing is shown', async () => {
    await render([]);
    expect(text(element().querySelector('.none'))).toBe('Nothing is shown here.');
  });
});
