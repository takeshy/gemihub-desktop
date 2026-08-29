/**
 * The file tree is dragged with pointer events, so the browser never scrolls the
 * list on its own: a folder that sits above the viewport (the alphabetically
 * first ones, once the tree is scrolled down) would be unreachable as a drop
 * target. Holding a drag against the top or bottom edge scrolls the list.
 *
 * The gate matters as much as the scrolling. A tall tree means rows sit inside
 * the edge band all the time, so scrolling the moment a drag starts there — or
 * whenever the pointer passes through on its way somewhere else — makes the list
 * bolt away under the cursor. Scrolling therefore starts only after the drag has
 * rested against the edge, and never while the pointer is outside the list.
 */
export const AUTO_SCROLL_EDGE = 32;
export const AUTO_SCROLL_MIN_SPEED = 2;
export const AUTO_SCROLL_MAX_SPEED = 14;
/** How long a drag has to rest against an edge before the list starts moving. */
export const AUTO_SCROLL_DELAY_MS = 250;

export interface AutoScrollBounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Pixels to scroll per frame: negative scrolls up, positive down, 0 stands still. */
export function treeAutoScrollDelta(
  bounds: AutoScrollBounds,
  pointerX: number,
  pointerY: number,
): number {
  const height = bounds.bottom - bounds.top;
  if (height <= 0) return 0;
  if (pointerX < bounds.left || pointerX > bounds.right) return 0;
  if (pointerY < bounds.top || pointerY > bounds.bottom) return 0;
  const edge = Math.min(AUTO_SCROLL_EDGE, height / 4);
  const fromTop = pointerY - bounds.top;
  const fromBottom = bounds.bottom - pointerY;
  if (fromTop < edge) return -scrollSpeed(edge - fromTop, edge);
  if (fromBottom < edge) return scrollSpeed(edge - fromBottom, edge);
  return 0;
}

function scrollSpeed(distanceIntoEdge: number, edge: number): number {
  const ratio = Math.min(distanceIntoEdge, edge) / edge;
  return Math.round(
    AUTO_SCROLL_MIN_SPEED +
      ratio * (AUTO_SCROLL_MAX_SPEED - AUTO_SCROLL_MIN_SPEED),
  );
}
