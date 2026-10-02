import { TestBed } from '@angular/core/testing';

import { REVEAL_REACH, Reveal, revealPoint } from './reveal';

describe('Reveal', () => {
  const box = new DOMRect(100, 200, 300, 150); // left 100, top 200, right 400, bottom 350

  it('gives the pointer in the surface its place in the surface box', () => {
    expect(revealPoint(box, 150, 260)).toEqual({ x: 50, y: 60 });
  });

  it('lights a surface from outside it, as far as the reach', () => {
    expect(revealPoint(box, 400 + REVEAL_REACH, 200)).toEqual({ x: 300 + REVEAL_REACH, y: 0 });
    expect(revealPoint(box, 100 - REVEAL_REACH, 350 + REVEAL_REACH)).toEqual({ x: -REVEAL_REACH, y: 150 + REVEAL_REACH });
  });

  it('leaves a surface beyond the reach dark', () => {
    expect(revealPoint(box, 401 + REVEAL_REACH, 260)).toBeNull();
    expect(revealPoint(box, 150, 199 - REVEAL_REACH)).toBeNull();
  });

  it('tells the styles how far the light reaches', () => {
    TestBed.inject(Reveal);
    expect(document.documentElement.style.getPropertyValue('--app-reveal-reach')).toBe(`${REVEAL_REACH}px`);
  });
});
