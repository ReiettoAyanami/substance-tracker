import { DOCUMENT, Injectable, inject } from '@angular/core';

/**
 * The surfaces that rise above the page, Windows 10's tiles and menus: cards, panels, windows
 * (dialogs, the substance and batch windows) and the sidebar as a drawer. Not the small things
 * (buttons, toggles, chips, tooltips), not the menus and selects: those scroll inside, and a light
 * drawn on their edge would scroll away with their content.
 */
const SURFACES = [
  '.mat-mdc-card',
  '.mat-expansion-panel:not(.flat)',
  '.mat-mdc-dialog-surface',
  '.window',
  '.mat-drawer.mat-drawer-over',
].join(', ');

/** How far from the pointer an edge still lights up (px): the light's radius in styles.css. */
export const REVEAL_REACH = 120;

/** Where the pointer is in a surface's own box, or null when the surface is out of reach. */
export function revealPoint(box: DOMRect, x: number, y: number): { x: number; y: number } | null {
  const out =
    x < box.left - REVEAL_REACH || x > box.right + REVEAL_REACH || y < box.top - REVEAL_REACH || y > box.bottom + REVEAL_REACH;
  return out ? null : { x: x - box.left, y: y - box.top };
}

/**
 * Reveal, as in Windows 10's start menu (lenzi, 2026-10-02: "un effetto simile a quello che faceva
 * windows 10 nel menu di start"): a soft light follows the pointer and lights the edges of the
 * surfaces near it, only their edges (styles.css, "reveal"). Each
 * surface in reach gets the class `app-reveal` and the pointer's place in its box
 * (`--app-reveal-x`, `--app-reveal-y`); CSS draws the light. A surface covered where it is nearest
 * the pointer (under a window and its scrim, under the top bar) stays dark. With a finger the light
 * shows while it touches and goes when it lifts. Once a frame at most, outside Angular's change
 * detection: nothing here is the app's state.
 */
@Injectable({
  providedIn: 'root',
})
export class Reveal {
  private readonly document = inject(DOCUMENT);
  private pointer: { x: number; y: number } | null = null;
  private lit = new Set<HTMLElement>();
  private frame = 0;

  constructor() {
    const view = this.document.defaultView;
    if (!view) return;
    this.document.documentElement.style.setProperty('--app-reveal-reach', `${REVEAL_REACH}px`);

    const follow = (event: PointerEvent) => {
      this.pointer = { x: event.clientX, y: event.clientY };
      this.schedule();
    };
    const lift = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      this.pointer = null;
      this.schedule();
    };
    view.addEventListener('pointermove', follow, { passive: true });
    view.addEventListener('pointerdown', follow, { passive: true });
    view.addEventListener('pointerup', lift, { passive: true });
    view.addEventListener('pointercancel', lift, { passive: true });
    // The mouse left the browser's window.
    view.addEventListener('pointerout', (event) => {
      if (event.relatedTarget) return;
      this.pointer = null;
      this.schedule();
    });
    // The page moved under a still pointer.
    view.addEventListener('scroll', () => this.schedule(), { capture: true, passive: true });
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = this.document.defaultView!.requestAnimationFrame(() => {
      this.frame = 0;
      this.update();
    });
  }

  /** Every measure first, then every write: the browser lays the page out once. */
  private update(): void {
    const near: { surface: HTMLElement; x: number; y: number }[] = [];
    const pointer = this.pointer;
    if (pointer) {
      for (const surface of this.document.querySelectorAll<HTMLElement>(SURFACES)) {
        const box = surface.getBoundingClientRect();
        const point = revealPoint(box, pointer.x, pointer.y);
        if (point && !this.covered(surface, box, pointer)) near.push({ surface, ...point });
      }
    }

    const lit = new Set<HTMLElement>();
    for (const { surface, x, y } of near) {
      surface.style.setProperty('--app-reveal-x', `${x}px`);
      surface.style.setProperty('--app-reveal-y', `${y}px`);
      surface.classList.add('app-reveal');
      lit.add(surface);
    }
    for (const surface of this.lit) {
      if (lit.has(surface)) continue;
      surface.classList.remove('app-reveal');
      surface.style.removeProperty('--app-reveal-x');
      surface.style.removeProperty('--app-reveal-y');
    }
    this.lit = lit;
  }

  /** Something else is on top of the surface at its point nearest the pointer. */
  private covered(surface: HTMLElement, box: DOMRect, pointer: { x: number; y: number }): boolean {
    if (box.width === 0 || box.height === 0) return true;
    const x = Math.min(Math.max(pointer.x, box.left), box.right - 1);
    const y = Math.min(Math.max(pointer.y, box.top), box.bottom - 1);
    const top = this.document.elementFromPoint?.(x, y);
    return !!top && !surface.contains(top);
  }
}
