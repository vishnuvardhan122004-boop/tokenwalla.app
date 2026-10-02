/**
 * utils/gallery.ts
 *
 * Which photo a horizontal pager is showing, from its scroll offset.
 *
 * Split out of the viewer because it is the one part that can be wrong without
 * looking wrong: the counter reads "4 / 3", or `NaN / 3` on the frame before
 * layout gives the list a width, and the swipe itself still works fine.
 */

/** Index of the photo at `offsetX`, clamped into [0, count - 1]. */
export function photoIndexAt(offsetX: number, slideWidth: number, count: number): number {
  // Before layout, width is 0 — dividing by it gives Infinity or NaN, and NaN
  // fails every comparison below, so neither clamp would catch it.
  if (!(slideWidth > 0) || !(count > 0)) return 0;
  const i = Math.round(offsetX / slideWidth);
  return Math.min(Math.max(i, 0), count - 1);
}
