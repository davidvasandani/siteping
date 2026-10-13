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

/** Ancestor across shadow boundaries — anchors can sit in open shadow roots. */
function parentOf(el: Element): Element | null {
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

/**
 * Scrollable ancestors of `el`, innermost first. The document's scroller is
 * excluded (the window step handles it), and so is `<body>` while its
 * overflow propagates to the viewport — i.e. unless `<html>` clips.
 */
export function scrollableAncestors(el: Element): Element[] {
  const root = document.scrollingElement ?? document.documentElement;
  const bodyPropagates = getComputedStyle(document.documentElement).overflowY === "visible";
  const out: Element[] = [];
  for (let cur = parentOf(el); cur && cur !== root && cur !== document.documentElement; cur = parentOf(cur)) {
    if (cur === document.body && bodyPropagates) continue;
    if (scrollsOn(cur, "y") || scrollsOn(cur, "x")) out.push(cur);
  }
  return out;
}

/** Delta that centres [start, start+size] in [viewStart, viewStart+viewSize], clamped to the scroll range. */
function centreDelta(start: number, size: number, viewStart: number, viewSize: number, pos: number, max: number) {
  const delta = start + size / 2 - (viewStart + viewSize / 2);
  return Math.max(-pos, Math.min(max - pos, delta));
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
  const scrollers = scrollableAncestors(anchor);
  if (scrollers.length === 0) return false;

  let top = rect.top;
  let left = rect.left;
  for (const scroller of scrollers) {
    const box = scroller.getBoundingClientRect();
    // Only the axes the scroller itself scrolls: `overflow-x: hidden` is
    // still programmatically scrollable, and must stay put.
    const dy = !scrollsOn(scroller, "y")
      ? 0
      : centreDelta(
          top,
          rect.height,
          box.top + scroller.clientTop,
          scroller.clientHeight,
          scroller.scrollTop,
          scroller.scrollHeight - scroller.clientHeight,
        );
    const dx = !scrollsOn(scroller, "x")
      ? 0
      : centreDelta(
          left,
          rect.width,
          box.left + scroller.clientLeft,
          scroller.clientWidth,
          scroller.scrollLeft,
          scroller.scrollWidth - scroller.clientWidth,
        );
    if (dy !== 0 || dx !== 0) scroller.scrollBy({ top: dy, left: dx, behavior: "smooth" });
    top -= dy;
    left -= dx;
  }

  const doc = document.scrollingElement ?? document.documentElement;
  const dy = centreDelta(
    top,
    rect.height,
    0,
    window.innerHeight,
    window.scrollY,
    doc.scrollHeight - window.innerHeight,
  );
  const dx = centreDelta(left, rect.width, 0, window.innerWidth, window.scrollX, doc.scrollWidth - window.innerWidth);
  if (dy !== 0 || dx !== 0) window.scrollBy({ top: dy, left: dx, behavior: "smooth" });
  return true;
}
