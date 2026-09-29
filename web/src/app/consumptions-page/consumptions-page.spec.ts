import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConsumptionsPage } from './consumptions-page';

describe('ConsumptionsPage', () => {
  let fixture: ComponentFixture<ConsumptionsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsumptionsPage],
    }).compileComponents();

    fixture = TestBed.createComponent(ConsumptionsPage);
    await fixture.whenStable();
  });

  it('is an empty page for now: its title is in the top bar', () => {
    const main = (fixture.nativeElement as HTMLElement).querySelector('main.consumptions');
    expect(main).not.toBeNull();
    expect(main?.textContent?.trim()).toBe('');
  });
});
