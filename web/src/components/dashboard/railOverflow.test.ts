import { describe, it, expect } from 'vitest';
import { computeVisibleCount } from './railOverflow';

const uniform = (n: number, h = 50) => Array.from({ length: n }, () => h);

describe('computeVisibleCount', () => {
  it('shows all items when they all fit (no More needed)', () => {
    expect(computeVisibleCount({ availableHeight: 320, itemHeights: uniform(6), moreItemHeight: 50 })).toBe(6);
  });

  it('shows all items on an exact fit', () => {
    expect(computeVisibleCount({ availableHeight: 300, itemHeights: uniform(6), moreItemHeight: 50 })).toBe(6);
  });

  it('reserves a slot for More when items overflow by one', () => {
    // 7 items need 350 but only 300 available -> reserve More (50): 250 left -> 5 items
    expect(computeVisibleCount({ availableHeight: 300, itemHeights: uniform(7), moreItemHeight: 50 })).toBe(5);
  });

  it('reserves a slot for More when items overflow by many', () => {
    expect(computeVisibleCount({ availableHeight: 300, itemHeights: uniform(20), moreItemHeight: 50 })).toBe(5);
  });

  it('accounts for variable (taller) item heights', () => {
    // Heights: 40,40,80,80,40 = 280 total > 250 available.
    // Reserve More (40): budget 250. 40->80(1) ->120(2) ->200(3) -> +80=280 > 250 stop. 3 visible.
    expect(
      computeVisibleCount({ availableHeight: 250, itemHeights: [40, 40, 80, 80, 40], moreItemHeight: 40 }),
    ).toBe(3);
  });

  it('returns 0 when not even the first item fits beside More', () => {
    expect(computeVisibleCount({ availableHeight: 60, itemHeights: uniform(5, 50), moreItemHeight: 50 })).toBe(0);
  });

  it('handles degenerate inputs', () => {
    expect(computeVisibleCount({ availableHeight: 0, itemHeights: uniform(5), moreItemHeight: 50 })).toBe(0);
    expect(computeVisibleCount({ availableHeight: 300, itemHeights: [], moreItemHeight: 50 })).toBe(0);
  });
});
