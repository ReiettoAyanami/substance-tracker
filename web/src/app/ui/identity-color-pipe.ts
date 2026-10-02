import { Pipe, PipeTransform } from '@angular/core';

/** Step between consecutive ids, as a fraction of the band: the golden ratio, so neighbouring ids land far apart. */
const GOLDEN_RATIO = 0.6180339887;

/** The band of hues (oklch degrees): blue-violet, violet, purple, magenta; the theme's own violet. */
const HUE_FROM = 260;
const HUE_SPAN = 80;

/** Substances and batches have separate id sequences: substance 1 and batch 1 must differ (half the band apart). */
const BAND_OFFSET = { substance: 0, batch: 0.5 } as const;

/** Three lightnesses, by `id % 3`: two neighbouring hues still differ in lightness. */
const LIGHTNESS = [0.88, 0.74, 0.6] as const;

/** The most chroma a colour takes; less where sRGB cannot show it (the light violets). */
const MAX_CHROMA = 0.22;

/**
 * The identity colour of a substance or a batch (design-frontend.md): computed from the id, never
 * stored, never a status colour. All violet (lenzi, 2026-10-02: "per i colori terrei tutto viola
 * anche per le sostanze e i batch"; before, variant A, yellow to light blue): a band of hues from
 * blue-violet to magenta; the hue walks the band by the golden ratio, the lightness is one of three
 * by `id % 3`, the chroma the most the screen can show up to 0.22, so no colour is clipped into
 * another. Closer to each other than variant A's (least OKLab distance among the first 8: 0.027
 * against 0.060). A plain `oklch()`, the same everywhere.
 * FROZEN: changing the algorithm repaints everything.
 */
@Pipe({
  name: 'identityColor',
})
export class IdentityColorPipe implements PipeTransform {
  transform(id: number, kind: 'substance' | 'batch'): string {
    const position = (id * GOLDEN_RATIO + BAND_OFFSET[kind]) % 1;
    const hue = HUE_FROM + position * HUE_SPAN;
    const lightness = LIGHTNESS[id % 3];
    const chroma = maxChroma(lightness, hue);
    // As the browser writes it back (no trailing zeros), so a style reads the same string.
    return `oklch(${lightness} ${chroma} ${Number(hue.toFixed(1))})`;
  }
}

/** The most chroma, up to MAX_CHROMA, that keeps the colour inside sRGB (bisection, to a thousandth). */
function maxChroma(lightness: number, hue: number): number {
  if (inSrgb(lightness, MAX_CHROMA, hue)) return MAX_CHROMA;
  let low = 0;
  let high = MAX_CHROMA;
  while (high - low > 0.0005) {
    const middle = (low + high) / 2;
    if (inSrgb(lightness, middle, hue)) low = middle;
    else high = middle;
  }
  return Math.floor(low * 1000) / 1000;
}

/** Whether an oklch colour is one sRGB can show (OKLab to linear sRGB, Björn Ottosson's matrices). */
function inSrgb(lightness: number, chroma: number, hue: number): boolean {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return rgb.every((channel) => channel >= -1e-6 && channel <= 1 + 1e-6);
}
