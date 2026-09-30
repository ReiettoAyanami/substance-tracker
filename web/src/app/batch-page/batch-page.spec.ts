import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Router, RouterOutlet, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of, throwError } from 'rxjs';

import { BatchDetails } from '../data/batch';
import { CatalogApi } from '../data/catalog-api';
import { ConsumptionFilter } from '../data/consumption';
import { MetricDefinition, MetricsQuery, MetricsResult } from '../data/metric';
import { MetricsApi } from '../data/metrics-api';
import { ReportsApi } from '../data/reports-api';
import { Settings } from '../data/settings';
import { SettingsApi } from '../data/settings-api';
import { Substance } from '../data/substance';
import { Surface, ViewItem } from '../data/view-item';
import { ViewsApi } from '../data/views-api';
import { BatchPage } from './batch-page';

/** The substance's page, as far as this page needs it: the outlet it opens in. */
@Component({ template: '<router-outlet />', imports: [RouterOutlet] })
class SubstanceHost {}

const settings: Settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };

const batch = (changes: Partial<BatchDetails> = {}): BatchDetails => ({
  id: 7,
  substanceId: 4,
  name: 'Corona',
  quantity: '6.000',
  totalPrice: '9.00',
  occurredAt: '2026-09-15T10:00:00Z',
  note: null,
  clientRef: null,
  createdAt: '2026-09-15T10:00:00Z',
  remaining: '4.000',
  unitPrice: '1.500000',
  deactivatedAt: null,
  deactivatedByConsumptionId: null,
  deactivatedByAdjustmentId: null,
  consumptionCount: 2,
  avgQuantityPerConsumption: '1.000',
  minConsumption: '1.000',
  maxConsumption: '1.000',
  avgPricePerConsumption: '1.50',
  firstConsumedAt: '2026-09-20T18:00:00Z',
  ...changes,
});

const catalog: MetricDefinition[] = [
  { key: 'batch.used', scope: 'batch', label: 'Used', unit: 'share', scales: [], period: false, description: 'Used.' },
  { key: 'batch.pace', scope: 'batch', label: 'Pace', unit: 'quantity', scales: ['day', 'week'], period: false, description: 'Pace.' },
];

describe('BatchPage', () => {
  let harness: RouterTestingHarness;
  let answer: () => Observable<BatchDetails>;
  let metricsAsked: Array<{ id: number; query: Pick<MetricsQuery, 'per'> }>;
  let consumptionsAsked: ConsumptionFilter[];

  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const page = () => document.querySelector('app-batch-page')!;
  const in$ = (selector: string) => text(page().querySelector(selector));

  async function open(url: string, state?: object): Promise<void> {
    harness = await RouterTestingHarness.create();
    if (state) {
      await harness.navigateByUrl('/substances/4');
      await TestBed.inject(Router).navigateByUrl(url, { state });
    } else {
      await harness.navigateByUrl(url);
    }
    await harness.fixture.whenStable();
  }

  beforeEach(async () => {
    answer = () => of(batch());
    metricsAsked = [];
    consumptionsAsked = [];
    const substance = { id: 4, name: 'Birra', unit: 'bottiglia' } as Substance;
    await TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [{ path: 'substances/:id', component: SubstanceHost, children: [{ path: 'batches/:batchId', component: BatchPage }] }],
          withComponentInputBinding(),
        ),
        {
          provide: ReportsApi,
          useValue: {
            getBatch: () => answer(),
            listConsumptions: (filter: ConsumptionFilter) => (consumptionsAsked.push(filter), of([])),
          },
        },
        { provide: CatalogApi, useValue: { getSubstance: () => of(substance) } },
        { provide: SettingsApi, useValue: { getSettings: () => of(settings) } },
        {
          provide: MetricsApi,
          useValue: {
            getCatalog: () => of(catalog),
            getBatchMetrics: (id: number, query: Pick<MetricsQuery, 'per'>): Observable<MetricsResult> => {
              metricsAsked.push({ id, query });
              return of({ per: query.per ?? 'day', from: null, to: null, values: { 'batch.used': '0.3333', 'batch.pace': '0.143' } });
            },
          },
        },
        {
          provide: ViewsApi,
          useValue: {
            list: (surface: Surface): Observable<ViewItem[]> =>
              of(
                ['batch.used', 'batch.pace'].map((metric, i) => ({
                  id: i + 1,
                  surface,
                  section: null,
                  position: i + 1,
                  metric,
                  chart: null,
                  scale: null,
                  createdAt: '',
                })),
              ),
          },
        },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
  });

  it('shows what was bought, what is left, its metrics and its last consumptions', async () => {
    await open('/substances/4/batches/7');

    expect(in$('.name')).toBe('Corona');
    expect(in$('.substance')).toBe('Birra');
    expect(in$('.bought')).toBe('15 Sept 2026');
    expect(in$('.quantity')).toBe('6 bottiglia');
    expect(in$('.price')).toBe('€9.00 · €1.50/bottiglia');
    expect(in$('.left')).toBe('4 of 6 bottiglia left');
    expect(metricsAsked).toEqual([{ id: 7, query: { per: 'day' } }]);
    expect(Array.from(page().querySelectorAll('app-metrics-panel .value')).map(text)).toEqual(['33.3%', '0.143 bottiglia / day']);
    expect(consumptionsAsked).toEqual([{ batchId: 7 }]);
  });

  it('a finished batch says so', async () => {
    answer = () => of(batch({ remaining: '0.000', deactivatedAt: '2026-09-25T20:00:00Z' }));
    await open('/substances/4/batches/7');

    expect(in$('.left')).toBe('Finished');
  });

  it('a batch that is not there, or is of another substance, is not found', async () => {
    answer = () => throwError(() => ({ status: 404 }));
    await open('/substances/4/batches/7');
    expect(in$('.missing')).toBe('Batch not found');
  });

  it('a batch of another substance than the URL is not found', async () => {
    answer = () => of(batch({ substanceId: 9 }));
    await open('/substances/4/batches/7');
    expect(in$('.missing')).toBe('Batch not found');
  });

  it('closes onto its substance, with X or Esc, when it was not opened from a list', async () => {
    await open('/substances/4/batches/7');
    page().querySelector<HTMLButtonElement>('.close')!.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/substances/4');

    await harness.navigateByUrl('/substances/4/batches/7');
    await harness.fixture.whenStable();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/substances/4');
  });
});
