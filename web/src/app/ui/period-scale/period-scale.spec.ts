import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

import { TimeScale } from '../../data/metric';
import { PeriodScale, periodLabel } from './period-scale';

describe('PeriodScale', () => {
  let fixture: ComponentFixture<PeriodScale>;
  let days: number[];
  let pers: TimeScale[];

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function render(inputs: Record<string, unknown>): Promise<void> {
    fixture = TestBed.createComponent(PeriodScale);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    days = [];
    pers = [];
    fixture.componentInstance.daysChange.subscribe((d) => days.push(d));
    fixture.componentInstance.perChange.subscribe((p) => pers.push(p));
    await fixture.whenStable();
  }

  async function choose(field: string, option: string): Promise<string[]> {
    element().querySelector<HTMLElement>(`${field} mat-select`)!.click();
    await fixture.whenStable();
    const options = Array.from(document.querySelectorAll<HTMLElement>('mat-option'));
    const labels = options.map(text);
    options.find((o) => text(o) === option)!.click();
    await fixture.whenStable();
    return labels;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PeriodScale],
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    }).compileComponents();
  });

  it('shows the period and the scale chosen, and says what is chosen next', async () => {
    await render({ days: 30, per: 'day' });

    expect(text(element().querySelector('.period mat-select'))).toBe('Last 30 days');
    expect(text(element().querySelector('.per mat-select'))).toBe('day');

    expect(await choose('.period', 'All time')).toEqual(['Last 7 days', 'Last 30 days', 'Last 90 days', 'Last 365 days', 'All time']);
    expect(days).toEqual([0]);
    expect(await choose('.per', 'month')).toEqual(['hour', 'day', 'week', 'month', 'year']);
    expect(pers).toEqual(['month']);
  });

  it('leaves out a choice whose input is null', async () => {
    await render({ days: null, per: 'week' });
    expect(element().querySelector('.period')).toBeNull();
    expect(element().querySelector('.per')).not.toBeNull();
  });

  it('names the periods', () => {
    expect(periodLabel(0)).toBe('All time');
    expect(periodLabel(7)).toBe('Last 7 days');
  });
});
