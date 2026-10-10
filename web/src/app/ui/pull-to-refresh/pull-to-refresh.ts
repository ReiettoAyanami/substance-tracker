import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRouteSnapshot, Router } from '@angular/router';

import { PageRefresh } from '../../refresh/page-refresh';

/** How far the finger must travel before a touch counts as a pull and not as a tap. */
const SLOP_PX = 10;
/** The disc follows the finger at half its speed, as if pulled against a spring. */
const RESISTANCE = 0.5;
/** Released beyond this, the pull refreshes the page; before it, it is let go. */
export const PULL_THRESHOLD_PX = 72;
/** The disc goes no further down than this. */
const MAX_PULL_PX = 112;

/** Does the active route say the pull is not for it (Settings, the substance and batch windows)? */
function pullDisabled(route: ActivatedRouteSnapshot): boolean {
  for (let current: ActivatedRouteSnapshot | null = route; current; current = current.firstChild) {
    if (current.data['pullToRefresh'] === false) return true;
  }
  return false;
}

/**
 * Pull-to-refresh of the Android app (roadmap 2.11, design-android.md, "pull to refresh"): only the
 * gesture, no button. With the page at its top, a finger pulling down brings a disc down from under
 * the top bar, its arrow turning with the pull; let go beyond the threshold, the arrow spins while
 * PageRefresh asks the server and the page's data again, then the disc goes back up. Watches the
 * touches of the element it sits in (the shell's content), so the drawer, the dialogs and the
 * overlays (outside it) never start one; routes with `pullToRefresh: false` neither.
 */
@Component({
  selector: 'app-pull-to-refresh',
  imports: [MatIconModule],
  templateUrl: './pull-to-refresh.html',
  styleUrl: './pull-to-refresh.css',
})
export class PullToRefresh {
  private readonly refresh = inject(PageRefresh);
  private readonly router = inject(Router);

  /** How far down the disc is, in px; 0 hidden. */
  protected readonly distance = signal(0);
  /** The finger is on it: the disc follows without easing. */
  protected readonly dragging = signal(false);
  /** Released beyond the threshold: the server and the page are being asked. */
  protected readonly refreshing = signal(false);
  /** How much of the threshold the pull has covered, 0 to 1: the arrow turns and appears with it. */
  protected readonly progress = computed(() => Math.min(1, this.distance() / PULL_THRESHOLD_PX));

  private start: { x: number; y: number } | null = null;

  constructor() {
    const host = inject(ElementRef).nativeElement as HTMLElement;
    const destroyRef = inject(DestroyRef);
    const listeners: [string, (event: TouchEvent) => void][] = [
      ['touchstart', (event) => this.touchStart(event)],
      ['touchmove', (event) => this.touchMove(event)],
      ['touchend', () => void this.touchEnd()],
      ['touchcancel', () => this.letGo()],
    ];
    // Once rendered: in the shell's @if the host is not in the page yet while it is constructed, and
    // has no parent (2026-10-10, on the Pixel 9 the pull did nothing).
    afterNextRender(() => {
      const area = host.parentElement;
      if (!area) return;
      for (const [type, listener] of listeners) area.addEventListener(type, listener as EventListener, { passive: true });
      destroyRef.onDestroy(() => {
        for (const [type, listener] of listeners) area.removeEventListener(type, listener as EventListener);
      });
    });
  }

  private touchStart(event: TouchEvent): void {
    this.start = null;
    if (this.refreshing() || event.touches.length !== 1 || window.scrollY > 0) return;
    if (pullDisabled(this.router.routerState.snapshot.root)) return;
    const touch = event.touches[0];
    this.start = { x: touch.clientX, y: touch.clientY };
  }

  private touchMove(event: TouchEvent): void {
    if (!this.start || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const down = touch.clientY - this.start.y;
    if (!this.dragging()) {
      // Sideways, upwards (the page scrolls), or a page no longer at its top: not a pull.
      if (Math.abs(touch.clientX - this.start.x) > Math.abs(down) || down < 0 || window.scrollY > 0) {
        if (Math.abs(down) > SLOP_PX || Math.abs(touch.clientX - this.start.x) > SLOP_PX) this.start = null;
        return;
      }
      if (down < SLOP_PX) return;
      this.dragging.set(true);
    }
    this.distance.set(Math.max(0, Math.min(MAX_PULL_PX, (down - SLOP_PX) * RESISTANCE)));
  }

  private async touchEnd(): Promise<void> {
    if (!this.dragging()) {
      this.start = null;
      return;
    }
    if (this.distance() < PULL_THRESHOLD_PX) {
      this.letGo();
      return;
    }
    this.start = null;
    this.dragging.set(false);
    this.distance.set(PULL_THRESHOLD_PX);
    this.refreshing.set(true);
    try {
      await this.refresh.pull();
    } finally {
      this.refreshing.set(false);
      this.distance.set(0);
    }
  }

  private letGo(): void {
    this.start = null;
    this.dragging.set(false);
    if (!this.refreshing()) this.distance.set(0);
  }
}
