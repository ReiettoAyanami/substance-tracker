import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Sort } from '@angular/material/sort';

import { MetricDefinition, MetricsRow, SubstanceMetricsRow } from '../../data/metric';
import { MetricsTable } from './metrics-table';

const consumed: MetricDefinition = {
  key: 'substance.consumed',
  scope: 'substance',
  label: 'Consumed',
  unit: 'quantity',
  scales: [],
  period: true,
  description: 'Quantity consumed in the period.',
} as MetricDefinition;

const row = (id: number, name: string, value: string | null): SubstanceMetricsRow => ({
  id,
  name,
  unit: 'g',
  values: { 'substance.consumed': value },
});

describe('MetricsTable', () => {
  let fixture: ComponentFixture<MetricsTable>;
  let sorts: Sort[];
  let opened: MetricsRow[];

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const names = () => Array.from(element().querySelectorAll('tr.row .name-text')).map(text);

  async function render(inputs: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(MetricsTable);
    fixture.componentRef.setInput('first', 'Substance');
    fixture.componentRef.setInput('label', 'Substances');
    fixture.componentRef.setInput('columns', [consumed]);
    fixture.componentRef.setInput('rows', [row(1, 'Birra', '3'), row(2, 'Erba', null), row(3, 'Caffè', '12')]);
    fixture.componentRef.setInput('settings', { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' });
    fixture.componentRef.setInput('per', 'day');
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    sorts = [];
    opened = [];
    fixture.componentInstance.sortChange.subscribe((s) => sorts.push(s));
    fixture.componentInstance.opened.subscribe((r) => opened.push(r));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MetricsTable],
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    }).compileComponents();
  });

  it('shows the rows in the API order, a column per metric under the names', async () => {
    await render();

    expect(text(element().querySelector('th'))).toContain('Substance');
    expect(text(element().querySelectorAll('th')[1])).toContain('Consumed');
    expect(names()).toEqual(['Birra', 'Erba', 'Caffè']);
  });

  it('orders the rows by the column asked; a cell with no value goes last either way', async () => {
    await render({ sort: 'substance.consumed', direction: 'desc' });
    expect(names()).toEqual(['Caffè', 'Birra', 'Erba']);

    await render({ sort: 'substance.consumed', direction: 'asc' });
    expect(names()).toEqual(['Birra', 'Caffè', 'Erba']);

    await render({ sort: 'name', direction: 'asc' });
    expect(names()).toEqual(['Birra', 'Caffè', 'Erba']);
  });

  it('says which order a header asks for, and which row was opened; its host does the rest', async () => {
    await render();
    (element().querySelectorAll('th')[1].querySelector('.mat-sort-header-container') as HTMLElement).click();
    (element().querySelectorAll('tr.row')[1] as HTMLElement).click();

    expect(sorts).toEqual([{ active: 'substance.consumed', direction: 'asc' }]);
    expect(opened.map((r) => r.id)).toEqual([2]);
  });
});
