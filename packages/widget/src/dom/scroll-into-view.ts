/**
 * Scroll an annotated region into view on any host layout.
 *
 * Markers live in a body-level layer, so `marker.scrollIntoView()` can only
 * scroll the document. App shells scroll their content inside an element
 * (`html, body { overflow: hidden }` + `<main class="overflow-y-auto">`), where
 * that does nothing — or scrolls the document to a pin floating past the shell.
 * This walks the anchor's own scrollers instead, innermost first, and centres
 * the annotated rect in each, clamped to its scroll range.
 */

const SCROLLABLE_OVERFLOW = new Set(["auto", "scroll", "overlay"]);

/**
 * Flat-tree parent: a slotted element is laid out (and scrolled) by its slot,
 * a shadow root's children by the host.
 */
function parentOf(el: Element): Element | null {
  if (el.assignedSlot) return el.assignedSlot;
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function scrollsOn(el: Element, axis: "x" | "y"): boolean {
  const style = getComputedStyle(el);
  const overflow = axis === "y" ? style.overflowY : style.overflowX;
  if (!SCROLLABLE_OVERFLOW.has(overflow)) return false;
  return axis === "y" ? el.scrollHeight > el.clientHeight : el.scrollWidth > el.clientWidth;
}

interface ScrollChain {
  /** Scrollable ancestors, innermost first. */
  scrollers: Element[];
  /** Whether scrolling the window moves the target — false inside a `position: fixed` layer. */
  movesWithWindow: boolean;
}

/**
 * The document's scroller is excluded (the window step handles it), and so is
 * `<body>` while its overflow propagates to the viewport — i.e. unless
 * `<html>` clips. The walk stops at a `position: fixed` element: nothing
 * above it moves the target.
 */
function scrollChain(el: Element): ScrollChain {
  const root = document.scrollingElement ?? document.documentElement;
  const bodyPropagates = getComputedStyle(document.documentElement).overflowY === "visible";
  const scrollers: Element[] = [];
  if (getComputedStyle(el).position === "fixed") return { scrollers, movesWithWindow: false };
  for (let cur = parentOf(el); cur && cur !== root && cur !== document.documentElement; cur = parentOf(cur)) {
    if (cur === document.body && bodyPropagates) continue;
    if (scrollsOn(cur, "y") || scrollsOn(cur, "x")) scrollers.push(cur);
    if (getComputedStyle(cur).position === "fixed") return { scrollers, movesWithWindow: false };
  }
  return { scrollers, movesWithWindow: true };
}

/** Scrollable ancestors of `el`, innermost first (see `scrollChain`). */
export function scrollableAncestors(el: Element): Element[] {
  return scrollChain(el).scrollers;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Scroll `el` so the rect (`top`/`left`/`h`/`w`, viewport coordinates) is
 * centred in its client box, clamped to its scroll range, and return the
 * applied `[dy, dx]`. `viewport`: `el` is the document's scroller — its box is
 * the viewport and `window` does the scrolling.
 *
 * Only the axes an element itself scrolls move: `overflow-x: hidden` is still
 * programmatically scrollable, and must stay put. RTL horizontal ranges are
 * negative (`scrollLeft` runs from −(scrollWidth − clientWidth) to 0).
 */
function centreIn(el: Element, top: number, left: number, h: number, w: number, viewport: boolean): number[] {
  const box = viewport ? new DOMRect() : el.getBoundingClientRect();
  const viewTop = viewport ? 0 : box.top + el.clientTop;
  const viewLeft = viewport ? 0 : box.left + el.clientLeft;
  const overflowX = Math.max(0, el.scrollWidth - el.clientWidth);
  const rtl = getComputedStyle(el).direction === "rtl";
  const dy =
    viewport || scrollsOn(el, "y")
      ? clamp(
          top + h / 2 - viewTop - el.clientHeight / 2,
          -el.scrollTop,
          el.scrollHeight - el.clientHeight - el.scrollTop,
        )
      : 0;
  const dx =
    viewport || scrollsOn(el, "x")
      ? clamp(
          left + w / 2 - viewLeft - el.clientWidth / 2,
          (rtl ? -overflowX : 0) - el.scrollLeft,
          (rtl ? 0 : overflowX) - el.scrollLeft,
        )
      : 0;
  if (dy || dx) (viewport ? window : el).scrollBy({ top: dy, left: dx, behavior: "smooth" });
  return [dy, dx];
}

/**
 * Centre `rect` (viewport coordinates, inside `anchor`) in every scroller
 * between it and the viewport, then in the window. Returns `false` without
 * scrolling when the anchor has no inner scroller — window-only pages keep
 * the caller's own path.
 *
 * Deltas are computed up front from the current geometry, shifting the rect
 * by what each inner scroll will apply, so concurrent smooth scrolls compose.
 */
export function scrollRectIntoView(anchor: Element, rect: DOMRect): boolean {
  const { scrollers, movesWithWindow } = scrollChain(anchor);
  if (scrollers.length === 0) return false;

  let top = rect.top;
  let left = rect.left;
  for (const scroller of scrollers) {
    const [dy = 0, dx = 0] = centreIn(scroller, top, left, rect.height, rect.width, false);
    top -= dy;
    left -= dx;
  }
  if (movesWithWindow) {
    centreIn(document.scrollingElement ?? document.documentElement, top, left, rect.height, rect.width, true);
  }
  return true;
}
