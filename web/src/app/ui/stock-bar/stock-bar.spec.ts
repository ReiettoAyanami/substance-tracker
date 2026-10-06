import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StockBarSegment } from '../../data/substance';
import { IdentityColorPipe } from '../identity-color-pipe';
import { StockBar } from './stock-bar';

describe('StockBar', () => {
  let fixture: ComponentFixture<StockBar>;
  const batchColor = (id: number) => new IdentityColorPipe().transform(id, 'batch');

  async function render(segments: StockBarSegment[], max: string): Promise<HTMLElement[]> {
    fixture.componentRef.setInput('segments', segments);
    fixture.componentRef.setInput('max', max);
    fixture.componentRef.setInput('unit', 'capsula');
    fixture.componentRef.setInput('currency', 'EUR');
    await fixture.whenStable();
    return Array.from(fixture.nativeElement.querySelectorAll('.segment'));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StockBar],
    }).compileComponents();
    fixture = TestBed.createComponent(StockBar);
  });

  it('draws one batch bar per batch, in order, in its colour, as wide as its share of the maximum', async () => {
    const segments = await render(
      [
        { batchId: 1, name: 'Lavazza', remaining: '1.000', unitPrice: '0.350000' },
        { batchId: 6, name: null, remaining: '200.000', unitPrice: '0.320000' },
      ],
      '391.000',
    );

    expect(segments.length).toBe(2);
    expect(segments.every((segment) => segment.tagName === 'APP-BATCH-BAR')).toBe(true);
    expect(parseFloat(segments[0].style.flexBasis)).toBeCloseTo((1 / 391) * 100, 6);
    expect(parseFloat(segments[1].style.flexBasis)).toBeCloseTo((200 / 391) * 100, 6);
    const fill = (segment: HTMLElement) => segment.querySelector<HTMLElement>('.fill')!;
    expect(fill(segments[0]).style.backgroundColor).toBe(batchColor(1));
    expect(fill(segments[1]).style.backgroundColor).toBe(batchColor(6));
  });

  it('draws only one batch, out of its own quantity, the others shrunk away; then every one again', async () => {
    const all = [
      { batchId: 1, name: 'Lavazza', remaining: '1.000', unitPrice: '0.350000' },
      { batchId: 6, name: null, remaining: '150.000', unitPrice: '0.320000' },
    ];
    fixture.componentRef.setInput('only', { batchId: 6, remaining: '150.000', quantity: '200.000' });
    let [older, last] = await render(all, '300.000');

    const track: HTMLElement = fixture.nativeElement.querySelector('.track');
    expect(track.classList).toContain('only');
    expect(older.classList).toContain('away');
    expect(parseFloat(older.style.flexBasis)).toBe(0);
    expect(last.classList).not.toContain('away');
    expect(parseFloat(last.style.flexBasis)).toBeCloseTo(75, 6); // 150 of 200

    fixture.componentRef.setInput('only', null);
    [older, last] = await render(all, '300.000');
    expect(track.classList).not.toContain('only');
    expect(older.classList).not.toContain('away');
    expect(parseFloat(older.style.flexBasis)).toBeCloseTo((1 / 300) * 100, 6);
    expect(parseFloat(last.style.flexBasis)).toBeCloseTo(50, 6);
  });

  it('empties the track for a batch that is not among its segments (finished)', async () => {
    fixture.componentRef.setInput('only', { batchId: 9, remaining: '0.000', quantity: '20.000' });
    const segments = await render([{ batchId: 1, name: null, remaining: '8.000', unitPrice: '0.310000' }], '20.000');

    expect(segments[0].classList).toContain('away');
    expect(parseFloat(segments[0].style.flexBasis)).toBe(0);
  });

  it('is an image with the label it is given; with no batches the track is empty', async () => {
    fixture.componentRef.setInput('label', 'Stock: 0 bustine');
    const segments = await render([], '0.000');

    const track: HTMLElement = fixture.nativeElement.querySelector('.track');
    expect(segments.length).toBe(0);
    expect(track.getAttribute('role')).toBe('img');
    expect(track.getAttribute('aria-label')).toBe('Stock: 0 bustine');
  });
});
