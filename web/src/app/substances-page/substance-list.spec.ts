import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { Substance } from '../data/substance';
import { SubstanceList } from './substance-list';

const settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };
const substance = (id: number, name: string) => ({ id, name }) as Substance;

describe('SubstanceList', () => {
  let list: SubstanceList;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), SubstanceList],
    });
    list = TestBed.inject(SubstanceList);
    backend = TestBed.inject(HttpTestingController);
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

  it('asks a substance again after a write that changed its numbers (a batch), and shows what the API gives', () => {
    list.reload(3);

    const restocked = { ...substance(3, 'Erba'), summary: { stock: '5.000' } } as Substance;
    backend.expectOne('/api/substances/3').flush(restocked);
    const state = list.state();
    expect(state.status === 'loaded' && state.substances.find((s) => s.id === 3)).toEqual(restocked);
    expect(order()).toEqual(['Birra#4', 'Erba#3', 'Sigarette#2']);
  });

  it('keeps what it shows when the substance cannot be asked again', () => {
    list.reload(3);

    backend.expectOne('/api/substances/3').flush(null, { status: 500, statusText: 'Internal Server Error' });
    expect(order()).toEqual(['Birra#4', 'Erba#3', 'Sigarette#2']);
  });

  it('asks again for the substances when the search of the URL (?q=) changes, keeping those shown until the new ones arrive', async () => {
    await TestBed.inject(Router).navigateByUrl('/?q=%20per%20');

    const req = backend.expectOne('/api/substances?q=per'); // the text without the blanks around it; the settings are not asked again
    expect(order()).toEqual(['Birra#4', 'Erba#3', 'Sigarette#2']);
    req.flush([substance(4, 'Birra')]);
    expect(order()).toEqual(['Birra#4']);

    await TestBed.inject(Router).navigateByUrl('/?q=per&other=1'); // the same search: nothing to ask
    await TestBed.inject(Router).navigateByUrl('/');
    backend.expectOne('/api/substances').flush([substance(4, 'Birra'), substance(3, 'Erba')]);
    expect(order()).toEqual(['Birra#4', 'Erba#3']);
  });
});

describe('SubstanceList, opened by a link with a search', () => {
  it('asks at once for what the link searches for', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), SubstanceList],
    });
    await TestBed.inject(Router).navigateByUrl('/?q=peroni');
    const list = TestBed.inject(SubstanceList);
    const backend = TestBed.inject(HttpTestingController);

    backend.expectOne('/api/settings').flush(settings);
    backend.expectOne('/api/substances?q=peroni').flush([substance(4, 'Birra')]);
    const state = list.state();
    expect(state.status === 'loaded' && state.substances.map((s) => s.id)).toEqual([4]);
    backend.verify();
  });
});
