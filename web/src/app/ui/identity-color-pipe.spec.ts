import { IdentityColorPipe } from './identity-color-pipe';

// These values freeze the algorithm (design-frontend.md, "identity colour", all violet since
// 2026-10-02): changing them would repaint every substance and batch.
describe('IdentityColorPipe', () => {
  const pipe = new IdentityColorPipe();

  it('gives a substance a hue of the band from its id, a lightness by id % 3 and the most chroma sRGB shows', () => {
    expect(pipe.transform(1, 'substance')).toBe('oklch(0.74 0.179 309.4)');
    expect(pipe.transform(2, 'substance')).toBe('oklch(0.6 0.22 278.9)');
    expect(pipe.transform(3, 'substance')).toBe('oklch(0.88 0.107 328.3)');
  });

  it('puts batches half the band away: substance 1 and batch 1 differ (separate id sequences)', () => {
    expect(pipe.transform(1, 'batch')).toBe('oklch(0.74 0.133 269.4)');
    expect(pipe.transform(2, 'batch')).toBe('oklch(0.6 0.22 318.9)');
  });

  it('keeps every hue within the band, blue-violet to magenta', () => {
    expect(pipe.transform(1000, 'substance')).toBe('oklch(0.74 0.133 262.7)');
    expect(pipe.transform(1000, 'batch')).toBe('oklch(0.74 0.163 302.7)');
    for (let id = 1; id <= 200; id++) {
      for (const kind of ['substance', 'batch'] as const) {
        const hue = Number(pipe.transform(id, kind).match(/ ([\d.]+)\)$/)![1]);
        expect(hue).toBeGreaterThanOrEqual(260);
        expect(hue).toBeLessThanOrEqual(340);
      }
    }
  });
});
