import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConsumptionForm } from './consumption-form';

describe('ConsumptionForm', () => {
  let component: ConsumptionForm;
  let fixture: ComponentFixture<ConsumptionForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsumptionForm],
    }).compileComponents();

    fixture = TestBed.createComponent(ConsumptionForm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
