import { Directive, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { NgxEchartsDirective } from 'ngx-echarts';

import { SeriesData, SeriesLine } from '../../data/series';
import { Chart } from './chart';

/** Stands in for ngx-echarts: jsdom cannot draw. It keeps the options the chart would draw. */
@Directive({ selector: '[echarts]' })
class EchartsStub {
  readonly options = input<any>();
  readonly autoResize = input<boolean>();
  readonly initOpts = input<any>();
}

const line = (key: string, id: number, name: string): SeriesLine => ({
  key,
  kind: 'substance',
  id,
  substanceId: id,
  name,
  unit: 'beer',
  occurredAt: null,
  values: ['1.00'],
  total: '1.00',
});

const data = (series: SeriesLine[]): SeriesData => ({
  metric: 'series.cost',
  per: 'week',
  by: 'substance',
  from: '2026-09-01',
  to: '2026-09-07',
  periods: ['2026-W36'],
  series,
});

describe('Chart', () => {
  let fixture: ComponentFixture<Chart>;

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const drawn = () => fixture.debugElement.query((d) => d.injector.get(EchartsStub, null) !== null)?.injector.get(EchartsStub).options();

  async function render(inputs: Record<string, unknown>): Promise<void> {
    fixture = TestBed.createComponent(Chart);
    fixture.componentRef.setInput('type', 'bar');
    fixture.componentRef.setInput('unit', 'money');
    fixture.componentRef.setInput('settings', { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' });
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.overrideComponent(Chart, { remove: { imports: [NgxEchartsDirective] }, add: { imports: [EchartsStub] } });
    await TestBed.configureTestingModule({
      imports: [Chart],
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    }).compileComponents();
  });

  it('draws every line, with a chip for each to hide it by hand', async () => {
    await render({ data: data([line('substance:4', 4, 'Birra'), line('substance:1', 1, 'Caffè')]) });

    expect(Array.from(element().querySelectorAll('mat-chip-option')).map(text)).toEqual(['Birra', 'Caffè']);
    expect(drawn().series.map((s: any) => s.name)).toEqual(['Birra', 'Caffè']);
  });

  it('a batch is named with the day it was bought, in the zone of the settings', async () => {
    // bought years ago: its year is shown, whatever today is
    const batch: SeriesLine = { ...line('batch:7', 7, 'Lavazza'), kind: 'batch', occurredAt: '2020-09-19T22:30:00Z' };
    await render({ data: data([batch, { ...batch, key: 'batch:8', id: 8, name: null }]) });

    expect(Array.from(element().querySelectorAll('mat-chip-option')).map(text)).toEqual(['Lavazza · 20 Sept 2020', 'Unnamed batch · 20 Sept 2020']);
    expect(drawn().series.map((s: any) => s.name)).toEqual(['Lavazza · 20 Sept 2020', 'Unnamed batch · 20 Sept 2020']);
  });

  it('a chip tapped hides its line, tapped again shows it', async () => {
    await render({ data: data([line('substance:4', 4, 'Birra'), line('substance:1', 1, 'Caffè')]) });
    const chip = () => element().querySelectorAll<HTMLElement>('mat-chip-option .mdc-evolution-chip__action')[0]!;

    chip().click();
    await fixture.whenStable();
    expect(drawn().series.map((s: any) => s.name)).toEqual(['Caffè']);

    chip().click();
    await fixture.whenStable();
    expect(drawn().series.map((s: any) => s.name)).toEqual(['Birra', 'Caffè']);
  });

  it('no chips for a single line, nor when the filters are off', async () => {
    await render({ data: data([line('substance:4', 4, 'Birra')]) });
    expect(element().querySelector('mat-chip-listbox')).toBeNull();

    await render({ data: data([line('substance:4', 4, 'Birra'), line('substance:1', 1, 'Caffè')]), filters: false });
    expect(element().querySelector('mat-chip-listbox')).toBeNull();
    expect(drawn().series.length).toBe(2);
  });

  it('says when there is nothing in the period, and draws nothing', async () => {
    await render({ data: data([]) });
    expect(text(element().querySelector('.empty'))).toBe('Nothing in the period');
    expect(drawn()).toBeUndefined();
  });
});
