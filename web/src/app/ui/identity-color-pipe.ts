import { Pipe, PipeTransform } from '@angular/core';

/** Step between the hues of consecutive ids: the golden angle, so neighbouring ids land far apart. */
const GOLDEN_ANGLE = 137.508;

/** Substances and batches have separate id sequences: substance 1 and batch 1 must differ. */
const HUE_OFFSET = { substance: 0, batch: 180 } as const;

/**
 * The identity colour of a substance or a batch (design-frontend.md): the hue comes from the id,
 * chroma and lightness from the theme (`--identity-chroma`, `--identity-lightness` in styles.css),
 * so it reads in light and dark. Presentation only: never stored, never a status colour.
 * FROZEN: changing the algorithm repaints everything.
 */
@Pipe({
  name: 'identityColor',
})
export class IdentityColorPipe implements PipeTransform {
  transform(id: number, kind: 'substance' | 'batch'): string {
    const hue = (id * GOLDEN_ANGLE + HUE_OFFSET[kind]) % 360;
    return `oklch(var(--identity-lightness) var(--identity-chroma) ${hue.toFixed(1)})`;
  }
}
