import { TestBed } from '@angular/core/testing';

import { ConsumptionActions } from './consumption-actions';

describe('ConsumptionActions', () => {
  let service: ConsumptionActions;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConsumptionActions);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
