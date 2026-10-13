// @vitest-environment jsdom

// "Go to annotation" on app shells: the anchor scrolls inside an element, not
// the window, so the anchor's own scrollers must be driven. jsdom has no
// layout — geometry is stubbed per element.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scrollableAncestors, scrollRectIntoView } from "../../src/dom/scroll-into-view";

interface Box {
  top: number;
  left?: number;
  height: number;
  width?: number;
  scrollTop?: number;
  scrollHeight: number;
  scrollWidth?: number;
}

/** A scroll container with stubbed geometry and a spied `scrollBy`. */
function scroller(box: Box, overflow = "overflow-y: auto"): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("style", overflow);
  const width = box.width ?? 800;
  const props: Record<string, number> = {
    clientHeight: box.height,
    clientWidth: width,
    clientTop: 0,
    clientLeft: 0,
    scrollHeight: box.scrollHeight,
    scrollWidth: box.scrollWidth ?? width,
    scrollTop: box.scrollTop ?? 0,
    scrollLeft: 0,
  };
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(el, key, { configurable: true, value });
  }
  el.getBoundingClientRect = () => new DOMRect(box.left ?? 0, box.top, width, box.height);
  el.scrollBy = vi.fn() as unknown as typeof el.scrollBy;
  return el;
}

describe("scrollRectIntoView", () => {
  let windowScrollBy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    windowScrollBy = vi.fn();
    window.scrollBy = windowScrollBy as unknown as typeof window.scrollBy;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
  });

  afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.removeAttribute("style");
  });

  it("returns false and scrolls nothing when only the window scrolls", () => {
    const anchor = document.createElement("p");
    document.body.appendChild(anchor);

    expect(scrollRectIntoView(anchor, new DOMRect(0, 2000, 100, 50))).toBe(false);
    expect(windowScrollBy).not.toHaveBeenCalled();
  });

  it("centres the rect in an inner scroll container", () => {
    // Container fills the viewport (0..800), content 3000px tall, at scrollTop 0.
    const main = scroller({ top: 0, height: 800, scrollHeight: 3000 });
    const anchor = document.createElement("section");
    main.appendChild(anchor);
    document.body.appendChild(main);

    // Rect 2000..2100 → centre 2050; container centre 400 → delta 1650.
    expect(scrollRectIntoView(anchor, new DOMRect(10, 2000, 100, 100))).toBe(true);
    expect(main.scrollBy).toHaveBeenCalledWith({ top: 1650, left: 0, behavior: "smooth" });
  });

  it("clamps to the container's scroll range", () => {
    const main = scroller({ top: 0, height: 800, scrollHeight: 1000, scrollTop: 100 });
    const anchor = document.createElement("div");
    main.appendChild(anchor);
    document.body.appendChild(main);

    // Wants +1650, only 1000 - 800 - 100 = 100 left to scroll.
    scrollRectIntoView(anchor, new DOMRect(10, 2000, 100, 100));
    expect(main.scrollBy).toHaveBeenCalledWith({ top: 100, left: 0, behavior: "smooth" });
  });

  it("accounts for the inner scroll when scrolling an outer container", () => {
    // Outer viewport 0..800; inner box sits at 1000..1400 inside the outer content.
    const outer = scroller({ top: 0, height: 800, scrollHeight: 3000 });
    const inner = scroller({ top: 1000, height: 400, scrollHeight: 2000 });
    const anchor = document.createElement("div");
    inner.appendChild(anchor);
    outer.appendChild(inner);
    document.body.appendChild(outer);

    // Rect 1500..1550 (centre 1525): inner centre 1200 → +325, rect lands at 1175..1225.
    // Outer: centre 1200 vs 400 → +800.
    scrollRectIntoView(anchor, new DOMRect(0, 1500, 100, 50));
    expect(inner.scrollBy).toHaveBeenCalledWith({ top: 325, left: 0, behavior: "smooth" });
    expect(outer.scrollBy).toHaveBeenCalledWith({ top: 800, left: 0, behavior: "smooth" });
  });

  it("does not touch an axis the container clips", () => {
    // overflow-x hidden: wider content must not be scrolled sideways.
    const main = scroller(
      { top: 0, height: 800, scrollHeight: 3000, width: 400, scrollWidth: 2000 },
      "overflow-y: auto; overflow-x: hidden",
    );
    const anchor = document.createElement("div");
    main.appendChild(anchor);
    document.body.appendChild(main);

    scrollRectIntoView(anchor, new DOMRect(1500, 2000, 100, 100));
    expect(main.scrollBy).toHaveBeenCalledWith({ top: 1650, left: 0, behavior: "smooth" });
  });
});

describe("scrollableAncestors", () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.body.removeAttribute("style");
    document.documentElement.removeAttribute("style");
  });

  it("skips overflow:hidden and non-overflowing elements", () => {
    const clipped = scroller({ top: 0, height: 100, scrollHeight: 500 }, "overflow: hidden");
    const short = scroller({ top: 0, height: 500, scrollHeight: 500 });
    const anchor = document.createElement("div");
    short.appendChild(anchor);
    clipped.appendChild(short);
    document.body.appendChild(clipped);

    expect(scrollableAncestors(anchor)).toEqual([]);
  });

  it("crosses open shadow roots", () => {
    const main = scroller({ top: 0, height: 800, scrollHeight: 3000 });
    const host = document.createElement("x-card");
    const anchor = document.createElement("p");
    host.attachShadow({ mode: "open" }).appendChild(anchor);
    main.appendChild(host);
    document.body.appendChild(main);

    expect(scrollableAncestors(anchor)).toEqual([main]);
  });

  it("treats <body> as a scroller only when <html> clips (no propagation to the viewport)", () => {
    const anchor = document.createElement("div");
    document.body.appendChild(anchor);
    document.body.style.overflowY = "auto";
    Object.defineProperty(document.body, "scrollHeight", { configurable: true, value: 3000 });
    Object.defineProperty(document.body, "clientHeight", { configurable: true, value: 800 });

    expect(scrollableAncestors(anchor)).toEqual([]);

    document.documentElement.style.overflowY = "hidden";
    expect(scrollableAncestors(anchor)).toEqual([document.body]);
  });
});
