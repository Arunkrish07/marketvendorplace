/**
 * Pure fit math for the no-scroll overflow rail.
 *
 * Rail items vary in height (labels wrap to one or two lines), so we take the
 * measured height of each item rather than assuming a uniform row. Returns how
 * many tabs to render inline, from the top; the remainder belong in the More
 * popover. When not everything fits, one More slot is reserved.
 */
export function computeVisibleCount({
  availableHeight,
  itemHeights,
  moreItemHeight,
}: {
  availableHeight: number;
  itemHeights: number[];
  moreItemHeight: number;
}): number {
  const total = itemHeights.length;
  if (total === 0 || availableHeight <= 0) return 0;

  // If every tab fits, show them all — no More button, no reserved slot.
  const fullHeight = itemHeights.reduce((sum, h) => sum + h, 0);
  if (fullHeight <= availableHeight) return total;

  // Otherwise reserve the More button and greedily fit tabs from the top.
  // At most total - 1 tabs can show alongside More.
  let used = moreItemHeight;
  let count = 0;
  for (let i = 0; i < total - 1; i++) {
    if (used + itemHeights[i] <= availableHeight) {
      used += itemHeights[i];
      count++;
    } else {
      break;
    }
  }
  return count;
}
