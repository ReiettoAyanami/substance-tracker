import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { Substance } from '../data/substance';
import { SubstanceList } from './substance-list';

const settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };
const substance = (id: number, name: string) => ({ id, name }) as Substance;

describe('SubstanceList', () => {
  let list: SubstanceList;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), SubstanceList],
    });
    list = TestBed.inject(SubstanceList);
    const backend = TestBed.inject(HttpTestingController);
    backend.expectOne('/api/settings').flush(settings);
    backend
      .expectOne('/api/substances')
      .flush([substance(4, 'Birra'), substance(3, 'Erba'), substance(2, 'Sigarette')]);
  });

  const order = () => {
    const state = list.state();
    return state.status === 'loaded' ? state.substances.map((s) => `${s.name}#${s.id}`) : [];
  };

  it('adds a created substance where the API would list it: name (case and accents ignored), then id', () => {
    list.add(substance(9, 'caffè'));
    list.add(substance(10, 'Birra'));
    list.add(substance(11, 'Èrba'));

    expect(order()).toEqual(['Birra#4', 'Birra#10', 'caffè#9', 'Erba#3', 'Èrba#11', 'Sigarette#2']);
  });

  it('puts a changed substance in its new place, and drops a deleted one', () => {
    list.replace(substance(4, 'Tabacco'));
    expect(order()).toEqual(['Erba#3', 'Sigarette#2', 'Tabacco#4']);

    list.remove(2);
    expect(order()).toEqual(['Erba#3', 'Tabacco#4']);
  });
});
