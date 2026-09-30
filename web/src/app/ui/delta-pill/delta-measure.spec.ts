import { TestBed } from '@angular/core/testing';

import { DeltaMeasure } from './delta-measure';

const KEY = 'substance-tracker.delta-measure';

describe('DeltaMeasure', () => {
  /** The service as a page opened now would get it. */
  function fresh(): DeltaMeasure {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(DeltaMeasure);
  }

  beforeEach(() => localStorage.clear());

  it('shows the change in quantity at first', () => {
    expect(fresh().shown()).toBe('quantity');
  });

  it('switches to the price, and back', () => {
    const measure = fresh();

    measure.toggle();
    expect(measure.shown()).toBe('price');

    measure.toggle();
    expect(measure.shown()).toBe('quantity');
  });

  it('remembers the choice in this browser', () => {
    fresh().toggle();
    expect(localStorage.getItem(KEY)).toBe('price');
    expect(fresh().shown()).toBe('price');

    fresh().toggle();
    expect(localStorage.getItem(KEY)).toBe('quantity');
    expect(fresh().shown()).toBe('quantity');
  });

  it('falls back to the quantity on anything else it finds stored', () => {
    localStorage.setItem(KEY, 'both');
    expect(fresh().shown()).toBe('quantity');
  });
});
