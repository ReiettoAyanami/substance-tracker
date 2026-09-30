import { MetricDefinition, MetricUnit, TimeScale } from '../data/metric';
import { MetricValuePipe } from './metric-value-pipe';

const ALL: TimeScale[] = ['hour', 'day', 'week', 'month', 'year'];

function metric(unit: MetricUnit, scales: TimeScale[] = []): MetricDefinition {
  return { key: `substance.${unit}`, scope: 'substance', label: unit, unit, scales, period: true, description: '' };
}

describe('MetricValuePipe', () => {
  const pipe = new MetricValuePipe();
  const reading = { unit: 'beer', currency: 'EUR', per: 'week' as TimeScale };
  const show = (value: string | null, unit: MetricUnit, scales: TimeScale[] = [], per: TimeScale = 'week') =>
    pipe.transform(value, metric(unit, scales), { ...reading, per });

  it('shows a total in the unit of the substance, a rate per the scale chosen', () => {
    expect(show('9.000', 'quantity')).toBe('9 beer');
    expect(show('2.250', 'quantity', ALL)).toBe('2.25 beer / week');
    expect(show('0.013', 'quantity', ALL, 'hour')).toBe('0.013 beer / hour');
  });

  it('shows money in the currency of the settings, cents always', () => {
    expect(show('14.00', 'money')).toBe('€14.00');
    expect(show('0.21', 'money', ALL, 'day')).toBe('€0.21 / day');
    expect(pipe.transform('3.5', metric('money'), { ...reading, currency: 'GBP' })).toBe('£3.50');
  });

  it('counts, as they are or per the scale', () => {
    expect(show('3', 'count')).toBe('3');
    expect(show('1.50', 'count', ALL)).toBe('1.5 / week');
  });

  it('ranks as ordinals', () => {
    expect(['1', '2', '3', '4', '11', '12', '13', '21', '22', '101'].map((n) => show(n, 'rank'))).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '101st',
    ]);
  });

  it('changes as signed percentages, like the delta pill; shares as plain ones', () => {
    expect(show('0.5000', 'change')).toBe('+50%');
    expect(show('-0.3333', 'change')).toBe('-33.3%');
    expect(show('0.0000', 'change')).toBe('0%');
    expect(show('0.1667', 'share')).toBe('16.7%');
    expect(show('1.0000', 'share')).toBe('100%');
  });

  it('durations in the scale chosen, singular for exactly one', () => {
    expect(show('3.58', 'duration', ALL, 'day')).toBe('3.58 days');
    expect(show('1.00', 'duration', ALL, 'week')).toBe('1 week');
    expect(show('0.12', 'duration', ALL, 'month')).toBe('0.12 months');
    expect(show('86.00', 'duration', ALL, 'hour')).toBe('86 hours');
  });

  it('shifts of the clock in hours and minutes', () => {
    expect(show('-0.66', 'hours')).toBe('-40 min');
    expect(show('1.34', 'hours')).toBe('+1 h 20 min');
    expect(show('2.00', 'hours')).toBe('+2 h');
    expect(show('0.00', 'hours')).toBe('0 min');
  });

  it('a dash when the API has no value', () => {
    expect(show(null, 'duration', ALL)).toBe('—');
    expect(pipe.transform(undefined, metric('money'), reading)).toBe('—');
  });
});
