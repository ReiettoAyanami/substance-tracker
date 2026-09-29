import { UnitPricePipe } from './unit-price-pipe';

describe('UnitPricePipe', () => {
  const pipe = new UnitPricePipe();
  /** Intl puts a non-breaking space before the currency sign. */
  const plain = (value: string) => value.replace(/\s/g, ' ');

  it('rounds to cents, in the currency of the settings, per unit', () => {
    expect(plain(pipe.transform('0.325000', 'EUR', 'sigaretta'))).toBe('€0.33/sigaretta');
  });

  it('rounds half up on the decimal digits (1.005 → 1,01, where toFixed or Math.round give 1.00)', () => {
    expect(plain(pipe.transform('1.005000', 'EUR', 'g'))).toBe('€1.01/g');
  });

  it('is "—" when there is no price', () => {
    expect(pipe.transform(null, 'EUR', 'g')).toBe('—');
    expect(pipe.transform(undefined, 'EUR', 'g')).toBe('—');
  });
});
