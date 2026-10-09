import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Measure, MeasureToggle } from './measure-toggle';

describe('MeasureToggle', () => {
  let fixture: ComponentFixture<MeasureToggle>;
  /** Taps that reached what is around the pill (a card that opens its page or its details). */
  let around: number;

  async function render(measure: Measure): Promise<HTMLButtonElement> {
    fixture = TestBed.createComponent(MeasureToggle);
    fixture.componentRef.setInput('measure', measure);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    around = 0;
    element.parentElement?.addEventListener('click', () => around++);
    return element.querySelector<HTMLButtonElement>('button.pill')!;
  }

  const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function tap(pill: HTMLButtonElement): Promise<void> {
    pill.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MeasureToggle],
    }).compileComponents();
  });

  it('reads what its figure shows, "qty" with the whole word for a screen reader', async () => {
    let pill = await render('quantity');
    expect(text(pill)).toBe('qty');
    expect(pill.getAttribute('aria-label')).toBe('qty, the quantity. Show the price');

    pill = await render('price');
    expect(text(pill)).toBe('price');
    expect(pill.getAttribute('aria-label')).toBe('price. Show the quantity');
  });

  it('switches at a tap, says so, and the tap goes no further', async () => {
    const pill = await render('quantity');
    const changes: Measure[] = [];
    fixture.componentInstance.measure.subscribe((measure) => changes.push(measure));

    await tap(pill);
    expect(text(pill)).toBe('price');
    await tap(pill);
    expect(text(pill)).toBe('qty');

    expect(changes).toEqual(['price', 'quantity']);
    expect(around).toBe(0);
  });
});
