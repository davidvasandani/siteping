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
  /** Inside a `position: fixed` layer: scrolling the window does not move the target. */
  fixed: boolean;
}

/**
 * The document's scroller is excluded (the window step handles it), and so is
 * `<body>` while its overflow propagates to the viewport — i.e. unless
 * `<html>` clips. The walk stops at a `position: fixed` element (the anchor
 * included): nothing above it moves the target.
 */
function scrollChain(el: Element): ScrollChain {
  const html = document.documentElement;
  const root = document.scrollingElement ?? html;
  const bodyPropagates = getComputedStyle(html).overflowY === "visible";
  const scrollers: Element[] = [];
  for (let cur: Element | null = el; cur && cur !== root && cur !== html; cur = parentOf(cur)) {
    if (cur !== el && !(cur === document.body && bodyPropagates) && (scrollsOn(cur, "y") || scrollsOn(cur, "x"))) {
      scrollers.push(cur);
    }
    if (getComputedStyle(cur).position === "fixed") return { scrollers, fixed: true };
  }
  return { scrollers, fixed: false };
}

/** Scrollable ancestors of `el`, innermost first (see `scrollChain`). */
export function scrollableAncestors(el: Element): Element[] {
  return scrollChain(el).scrollers;
}

/**
 * Whether the user can scroll the viewport on `axis`. An app shell clips it
 * (`overflow: hidden` on `<html>`, or on `<body>` when it propagates) — yet the
 * body-level marker layer still makes it programmatically scrollable, which
 * would slide the whole shell.
 */
function viewportScrolls(axis: "x" | "y"): boolean {
  const overflow = (el: Element) => getComputedStyle(el)[axis === "y" ? "overflowY" : "overflowX"];
  const value = overflow(document.documentElement);
  return !/hidden|clip/.test(value === "visible" ? overflow(document.body) : value);
}

/**
 * Scroll `el` so the rect (`top`/`left`/`h`/`w`, viewport coordinates) is
 * centred in its client box, and return the `[dy, dx]` it actually moves.
 *
 * The browser does the clamping — RTL (`scrollLeft` ≤ 0), `column-reverse`
 * (`scrollTop` ≤ 0) and range ends included: the request is applied
 * instantly, the real offset change read back, then the element is put back
 * and animated by exactly that amount. Only the axes `el` itself scrolls
 * move — `overflow-x: hidden` is still programmatically scrollable, and must
 * stay put.
 */
function centreIn(el: Element, top: number, left: number, h: number, w: number): number[] {
  const box = el.getBoundingClientRect();
  const y = el.scrollTop;
  const x = el.scrollLeft;
  el.scrollBy({
    top: scrollsOn(el, "y") ? top + h / 2 - box.top - el.clientTop - el.clientHeight / 2 : 0,
    left: scrollsOn(el, "x") ? left + w / 2 - box.left - el.clientLeft - el.clientWidth / 2 : 0,
    behavior: "instant",
  });
  const dy = el.scrollTop - y;
  const dx = el.scrollLeft - x;
  if (dy || dx) {
    el.scrollTo({ top: y, left: x, behavior: "instant" });
    el.scrollBy({ top: dy, left: dx, behavior: "smooth" });
  }
  return [dy, dx];
}

/**
 * Centre `rect` (viewport coordinates, inside `anchor`) in every scroller
 * between it and the viewport, then in the window. Returns `false` without
 * scrolling when the anchor has no inner scroller — window-only pages keep
 * the caller's own path.
 *
 * Each scroller's applied delta shifts the rect before the next (outer) one
 * is measured, so the concurrent smooth scrolls compose.
 */
export function scrollRectIntoView(anchor: Element, rect: DOMRect): boolean {
  const { scrollers, fixed } = scrollChain(anchor);
  if (scrollers.length === 0) return false;

  let top = rect.top;
  let left = rect.left;
  for (const scroller of scrollers) {
    const [dy = 0, dx = 0] = centreIn(scroller, top, left, rect.height, rect.width);
    top -= dy;
    left -= dx;
  }
  // Last scroller: the window clamps on its own (window metrics hold in quirks mode too).
  const dy = viewportScrolls("y") ? top + rect.height / 2 - innerHeight / 2 : 0;
  const dx = viewportScrolls("x") ? left + rect.width / 2 - innerWidth / 2 : 0;
  if (!fixed && (dy || dx)) window.scrollBy({ top: dy, left: dx, behavior: "smooth" });
  return true;
}
