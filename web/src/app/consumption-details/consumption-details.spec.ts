import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Observable, of } from 'rxjs';

import { MetricDefinition, MetricsQuery, MetricsResult } from '../data/metric';
import { MetricsApi } from '../data/metrics-api';
import { Settings } from '../data/settings';
import { Surface, ViewItem } from '../data/view-item';
import { ViewsApi } from '../data/views-api';
import { ConsumptionDetails, ConsumptionDetailsData, ConsumptionHeader } from './consumption-details';

const settings: Settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };

const catalog: MetricDefinition[] = [
  { key: 'consumption.rankInDay', scope: 'consumption', label: 'Number that day', unit: 'rank', scales: [], period: false, description: '' },
  { key: 'consumption.hourVsUsual', scope: 'consumption', label: 'Hour against the usual', unit: 'hours', scales: [], period: false, description: '' },
];

const batchConsumption: ConsumptionHeader = {
  type: 'consumption',
  id: 40,
  substanceId: 4,
  substanceName: 'Birra',
  unit: 'bottiglia',
  batchId: 7,
  batchName: 'Corona',
  name: null,
  occurredAt: '2026-09-25T20:00:00Z',
  quantity: '1.000',
  cost: '1.50',
};

describe('ConsumptionDetails', () => {
  let fixture: ComponentFixture<ConsumptionDetails>;
  let asked: Array<[string, number, Pick<MetricsQuery, 'per'>]>;

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function render(consumption: ConsumptionHeader): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ConsumptionDetails],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { consumption, settings } satisfies ConsumptionDetailsData },
        {
          provide: MetricsApi,
          useValue: {
            getCatalog: () => of(catalog),
            getConsumptionMetrics: (type: string, id: number, query: Pick<MetricsQuery, 'per'>): Observable<MetricsResult> => {
              asked.push([type, id, query]);
              return of({ per: 'day', from: null, to: null, values: { 'consumption.rankInDay': '2', 'consumption.hourVsUsual': '1.34' } });
            },
          },
        },
        {
          provide: ViewsApi,
          useValue: {
            list: (surface: Surface): Observable<ViewItem[]> =>
              of(catalog.map((m, i) => ({ id: i + 1, surface, section: null, position: i + 1, metric: m.key, chart: null, scale: null, createdAt: '' }))),
          },
        },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ConsumptionDetails);
    await fixture.whenStable();
  }

  beforeEach(() => {
    asked = [];
  });

  it('says what the consumption was, and shows its metrics', async () => {
    await render(batchConsumption);

    expect(text(element().querySelector('.title'))).toBe('Birra');
    expect(text(element().querySelector('.when'))).toBe('25 Sept 2026, 22:00');
    expect(text(element().querySelector('.source'))).toBe('Corona');
    expect(text(element().querySelector('.amount'))).toBe('1 bottiglia · €1.50');
    expect(asked).toEqual([['consumption', 40, { per: 'day' }]]);
    expect(Array.from(element().querySelectorAll('app-metrics-panel .value')).map(text)).toEqual(['2nd', '+1 h 20 min']);
  });

  it('a one-time consumption: its name, and its own metrics', async () => {
    await render({ ...batchConsumption, type: 'one_time', id: 9, batchId: null, batchName: null, name: 'bar', cost: undefined });

    expect(text(element().querySelector('.source'))).toBe('One-time · bar');
    expect(text(element().querySelector('.amount'))).toBe('1 bottiglia');
    expect(asked).toEqual([['one_time', 9, { per: 'day' }]]);
  });
});
