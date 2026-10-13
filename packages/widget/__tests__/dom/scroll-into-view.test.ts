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

/**
 * A scroll container with stubbed geometry. `scrollBy`/`scrollTo` emulate the
 * browser: instant requests move the offsets, clamped to the scroll range
 * (negative in RTL); smooth ones are only recorded.
 */
function scroller(box: Box, style = "overflow-y: auto"): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("style", style);
  const width = box.width ?? 800;
  const maxY = box.scrollHeight - box.height;
  const maxX = (box.scrollWidth ?? width) - width;
  const rtl = style.includes("rtl");
  const props: Record<string, number> = {
    clientHeight: box.height,
    clientWidth: width,
    clientTop: 0,
    clientLeft: 0,
    scrollHeight: box.scrollHeight,
    scrollWidth: box.scrollWidth ?? width,
  };
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(el, key, { configurable: true, value });
  }
  const offsets = { top: box.scrollTop ?? 0, left: 0 };
  Object.defineProperty(el, "scrollTop", { configurable: true, get: () => offsets.top });
  Object.defineProperty(el, "scrollLeft", { configurable: true, get: () => offsets.left });
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const moveTo = (top: number, left: number) => {
    offsets.top = clamp(top, 0, maxY);
    offsets.left = rtl ? clamp(left, -maxX, 0) : clamp(left, 0, maxX);
  };
  el.getBoundingClientRect = () => new DOMRect(box.left ?? 0, box.top, width, box.height);
  el.scrollBy = vi.fn((opts: ScrollToOptions) => {
    if (opts.behavior === "instant") moveTo(offsets.top + (opts.top ?? 0), offsets.left + (opts.left ?? 0));
  }) as unknown as typeof el.scrollBy;
  el.scrollTo = vi.fn((opts: ScrollToOptions) =>
    moveTo(opts.top ?? 0, opts.left ?? 0),
  ) as unknown as typeof el.scrollTo;
  return el;
}

/** The smooth (visible) scroll an element was asked for. */
function smoothScroll(el: HTMLElement) {
  return vi.mocked(el.scrollBy).mock.calls.find(([opts]) => (opts as ScrollToOptions).behavior === "smooth")?.[0];
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
    expect(smoothScroll(main)).toEqual({ top: 1650, left: 0, behavior: "smooth" });
  });

  it("then centres what is left in the window", () => {
    // The container sits below the fold of an 800px viewport.
    const main = scroller({ top: 1500, height: 400, scrollHeight: 2000 });
    const anchor = document.createElement("div");
    main.appendChild(anchor);
    document.body.appendChild(main);

    // Rect 2500..2600: container centre 1700 → +850, rect lands at 1650..1750;
    // window centre 400 → +1300 (the window clamps itself).
    scrollRectIntoView(anchor, new DOMRect(0, 2500, 100, 100));
    expect(smoothScroll(main)).toEqual({ top: 850, left: 0, behavior: "smooth" });
    expect(windowScrollBy).toHaveBeenCalledWith({ top: 1300, left: -550, behavior: "smooth" });
  });

  it("never slides an app shell whose viewport is clipped", () => {
    // html/body overflow hidden: the marker layer still makes the window
    // programmatically scrollable — it must not be touched.
    document.documentElement.style.overflowY = "hidden";
    document.documentElement.style.overflowX = "hidden";
    const main = scroller({ top: 64, height: 736, scrollHeight: 3000 });
    const anchor = document.createElement("div");
    main.appendChild(anchor);
    document.body.appendChild(main);

    scrollRectIntoView(anchor, new DOMRect(0, 2500, 100, 100));
    expect(smoothScroll(main)).toBeDefined();
    expect(windowScrollBy).not.toHaveBeenCalled();
  });

  it("clamps to the container's scroll range", () => {
    const main = scroller({ top: 0, height: 800, scrollHeight: 1000, scrollTop: 100 });
    const anchor = document.createElement("div");
    main.appendChild(anchor);
    document.body.appendChild(main);

    // Wants +1650, only 1000 - 800 - 100 = 100 left to scroll.
    scrollRectIntoView(anchor, new DOMRect(10, 2000, 100, 100));
    expect(smoothScroll(main)).toEqual({ top: 100, left: 0, behavior: "smooth" });
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
    expect(smoothScroll(inner)).toEqual({ top: 325, left: 0, behavior: "smooth" });
    expect(smoothScroll(outer)).toEqual({ top: 800, left: 0, behavior: "smooth" });
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
    expect(smoothScroll(main)).toEqual({ top: 1650, left: 0, behavior: "smooth" });
  });

  it("puts the container back before animating, so only the smooth scroll shows", () => {
    const main = scroller({ top: 0, height: 800, scrollHeight: 3000 });
    const anchor = document.createElement("div");
    main.appendChild(anchor);
    document.body.appendChild(main);

    scrollRectIntoView(anchor, new DOMRect(10, 2000, 100, 100));
    expect(main.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
    expect(main.scrollTop).toBe(0);
  });

  it("scrolls an RTL container towards negative scrollLeft", () => {
    // RTL: scrollLeft runs from -(2000 - 400) to 0, starting at 0 (right edge).
    const main = scroller(
      { top: 0, height: 400, scrollHeight: 400, width: 400, scrollWidth: 2000 },
      "overflow-x: auto; direction: rtl",
    );
    const anchor = document.createElement("div");
    main.appendChild(anchor);
    document.body.appendChild(main);

    // Rect -1000..-900 (centre -950) vs container centre 200 → -1150.
    scrollRectIntoView(anchor, new DOMRect(-1000, 100, 100, 50));
    expect(smoothScroll(main)).toEqual({ top: 0, left: -1150, behavior: "smooth" });
  });

  it("leaves the window alone inside a position:fixed layer", () => {
    const panel = scroller({ top: 0, height: 400, scrollHeight: 2000 }, "position: fixed; overflow-y: auto");
    const anchor = document.createElement("div");
    panel.appendChild(anchor);
    document.body.appendChild(panel);

    scrollRectIntoView(anchor, new DOMRect(0, 1200, 100, 50));
    expect(smoothScroll(panel)).toEqual({ top: 1025, left: 0, behavior: "smooth" });
    expect(windowScrollBy).not.toHaveBeenCalled();
  });

  it("handles a fixed anchor with no scroller without scrolling anything", () => {
    const header = document.createElement("header");
    header.setAttribute("style", "position: fixed");
    const anchor = document.createElement("div");
    header.appendChild(anchor);
    document.body.appendChild(header);

    expect(scrollRectIntoView(anchor, new DOMRect(0, 10, 100, 50))).toBe(true);
    expect(windowScrollBy).not.toHaveBeenCalled();
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

  it("follows a slotted anchor into the shadow scroller that renders it", () => {
    const host = document.createElement("x-panel");
    const anchor = document.createElement("p");
    anchor.slot = "content";
    host.appendChild(anchor);
    const shadow = host.attachShadow({ mode: "open" });
    const main = scroller({ top: 0, height: 400, scrollHeight: 2000 });
    const slot = document.createElement("slot");
    slot.name = "content";
    main.appendChild(slot);
    shadow.appendChild(main);
    document.body.appendChild(host);

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
