import { IdentityColorPipe } from './identity-color-pipe';

// These values freeze the algorithm (design-frontend.md, "identity colour", variant A of
// 2026-10-02): changing them would repaint every substance and batch.
describe('IdentityColorPipe', () => {
  const pipe = new IdentityColorPipe();

  it('gives a substance a hue of the band from its id, a lightness by id % 3 and the most chroma sRGB shows', () => {
    expect(pipe.transform(1, 'substance')).toBe('oklch(0.8 0.143 181.5)');
    expect(pipe.transform(2, 'substance')).toBe('oklch(0.7 0.17 128)');
    expect(pipe.transform(3, 'substance')).toBe('oklch(0.9 0.08 214.6)');
  });

  it('puts batches half the band away: substance 1 and batch 1 differ (separate id sequences)', () => {
    expect(pipe.transform(1, 'batch')).toBe('oklch(0.8 0.17 111.5)');
    expect(pipe.transform(2, 'batch')).toBe('oklch(0.7 0.118 198)');
  });

  it('keeps every hue within the band, yellow to light blue', () => {
    expect(pipe.transform(1000, 'substance')).toBe('oklch(0.8 0.166 99.8)');
    expect(pipe.transform(1000, 'batch')).toBe('oklch(0.8 0.158 169.8)');
    for (let id = 1; id <= 200; id++) {
      for (const kind of ['substance', 'batch'] as const) {
        const hue = Number(pipe.transform(id, kind).match(/ ([\d.]+)\)$/)![1]);
        expect(hue).toBeGreaterThanOrEqual(95);
        expect(hue).toBeLessThanOrEqual(235);
      }
    }
  });
});
