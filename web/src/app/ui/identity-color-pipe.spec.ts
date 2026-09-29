import { IdentityColorPipe } from './identity-color-pipe';

// These values freeze the algorithm (design-frontend.md, "identity colour"): changing them would
// repaint every substance and batch.
describe('IdentityColorPipe', () => {
  const pipe = new IdentityColorPipe();
  const color = (hue: string) => `oklch(var(--identity-lightness) var(--identity-chroma) ${hue})`;

  it('gives a substance a hue from its id, with the theme lightness and the fixed chroma', () => {
    expect(pipe.transform(1, 'substance')).toBe(color('137.5'));
  });

  it('offsets batches by half a turn: substance 1 and batch 1 differ (separate id sequences)', () => {
    expect(pipe.transform(1, 'batch')).toBe(color('317.5'));
  });

  it('keeps the hue within one turn', () => {
    expect(pipe.transform(3, 'substance')).toBe(color('52.5'));
    expect(pipe.transform(2, 'batch')).toBe(color('95.0'));
    expect(pipe.transform(1000, 'batch')).toBe(color('168.0'));
  });
});
