import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { PageRefresh, PullOutcome } from '../../refresh/page-refresh';
import { PULL_THRESHOLD_PX, PullToRefresh } from './pull-to-refresh';

@Component({ template: '' })
class Page {}

/** The shell's content, the area whose touches the pull watches; there, the pull sits in an @if. */
@Component({
  imports: [PullToRefresh],
  template: `<div class="area">
    @if (shown) {
      <app-pull-to-refresh />
    }
  </div>`,
})
class Shell {
  shown = true;
}

/** A touch event with one finger at `y` (x stays put). */
function touch(type: string, y: number, x = 100): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
  return event;
}

describe('PullToRefresh', () => {
  let fixture: ComponentFixture<Shell>;
  let area: HTMLElement;
  let finish: (outcome: PullOutcome) => void;
  const pull = vi.fn(() => new Promise<PullOutcome>((resolve) => (finish = resolve)));

  beforeEach(async () => {
    pull.mockClear();
    TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        provideRouter([
          { path: 'list', component: Page },
          { path: 'settings', component: Page, data: { pullToRefresh: false } },
        ]),
        { provide: PageRefresh, useValue: { pull } },
      ],
    });
    await TestBed.inject(Router).navigateByUrl('/list');
    fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    area = fixture.nativeElement.querySelector('.area');
  });

  /** A finger from y 100 down by `by` px, then lifted. */
  function drag(by: number): void {
    area.dispatchEvent(touch('touchstart', 100));
    for (let y = 100; y <= 100 + by; y += 20) area.dispatchEvent(touch('touchmove', y));
    area.dispatchEvent(touch('touchmove', 100 + by));
    fixture.detectChanges();
  }

  const disc = () => fixture.nativeElement.querySelector('.disc') as HTMLElement;
  const shift = () => disc().style.transform;

  it('follows the finger down at half its speed, at most to its limit', () => {
    drag(110);
    expect(shift()).toBe('translateY(50px)'); // (110 - 10 of slop) / 2
    drag(400);
    expect(shift()).toBe('translateY(112px)');
  });

  it('let go beyond the threshold, refreshes the page and spins until it is done', async () => {
    drag(PULL_THRESHOLD_PX * 2 + 40);
    area.dispatchEvent(touch('touchend', 0));
    fixture.detectChanges();
    expect(pull).toHaveBeenCalledOnce();
    expect(disc().classList).toContain('spinning');
    expect(shift()).toBe(`translateY(${PULL_THRESHOLD_PX}px)`);

    drag(300); // another pull while it spins: nothing
    area.dispatchEvent(touch('touchend', 0));
    expect(pull).toHaveBeenCalledOnce();

    finish('unreachable'); // a round for nothing: the disc goes back up all the same
    await fixture.whenStable();
    fixture.detectChanges();
    expect(disc().classList).not.toContain('spinning');
    expect(shift()).toBe('translateY(0px)');
  });

  it('let go before the threshold, goes back up without refreshing', () => {
    drag(PULL_THRESHOLD_PX); // 31 px of disc: short of 72
    area.dispatchEvent(touch('touchend', 0));
    fixture.detectChanges();
    expect(pull).not.toHaveBeenCalled();
    expect(shift()).toBe('translateY(0px)');
  });

  it('is no pull when the page is not at its top, when the finger goes sideways, nor on a page without it', async () => {
    window.scrollY = 300;
    drag(300);
    area.dispatchEvent(touch('touchend', 0));
    window.scrollY = 0;

    area.dispatchEvent(touch('touchstart', 100, 100));
    area.dispatchEvent(touch('touchmove', 130, 200));
    area.dispatchEvent(touch('touchmove', 400, 200));
    area.dispatchEvent(touch('touchend', 0));

    await TestBed.inject(Router).navigateByUrl('/settings');
    drag(300);
    area.dispatchEvent(touch('touchend', 0));

    fixture.detectChanges();
    expect(pull).not.toHaveBeenCalled();
    expect(shift()).toBe('translateY(0px)');
  });
});
