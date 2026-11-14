// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TINY_JPEG_DATA_URL } from "./fixtures.js";

const renderFromDom = vi.hoisted(() => vi.fn());
vi.mock("../../../packages/widget/src/screenshot.js", () => ({ captureAnnotatedScreenshot: renderFromDom }));

const { captureAnnotatedScreenshot, captureFromTab, hideChrome } = await import("../src/content/screenshot.js");

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height }) as DOMRect;

/** jsdom has no canvas and no bitmaps: stand-ins that record what was drawn. */
function stubCanvas({ bitmapWidth = 2560, bitmapHeight = 1440 } = {}) {
  const drawImage = vi.fn();
  const close = vi.fn();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: bitmapWidth, height: bitmapHeight, close })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as never);
  const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(TINY_JPEG_DATA_URL);
  return { drawImage, close, toDataURL };
}

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 720, configurable: true });
  document.body.innerHTML = `
    <main>page</main>
    <siteping-widget></siteping-widget>
    <div id="overlay" data-siteping-ignore="true" style="opacity: 0.5;"></div>
    <div id="siteping-markers"></div>`;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  renderFromDom.mockReset();
});

describe("hideChrome", () => {
  it("hides SitePing's own elements and leaves the page alone", () => {
    hideChrome();

    for (const selector of ["siteping-widget", "#overlay", "#siteping-markers"]) {
      const { style } = document.querySelector<HTMLElement>(selector) as HTMLElement;
      expect(style.getPropertyValue("opacity")).toBe("0");
      expect(style.getPropertyPriority("opacity")).toBe("important");
      expect(style.getPropertyValue("transition")).toBe("none");
    }
    expect(document.querySelector("main")?.getAttribute("style")).toBeNull();
  });

  it("puts every style back as it was", () => {
    const before = document.body.innerHTML;

    hideChrome()();

    expect(document.querySelector<HTMLElement>("#overlay")?.style.opacity).toBe("0.5");
    expect(document.querySelector<HTMLElement>("siteping-widget")?.style.opacity).toBe("");
    expect(document.body.innerHTML.replace(/ style=""/g, "")).toBe(before);
  });
});

describe("captureFromTab", () => {
  it("crops the padded rect out of the capture, in device pixels", async () => {
    const { drawImage, close, toDataURL } = stubCanvas();

    const shot = await captureFromTab(rect(400, 300, 200, 100), undefined, async () => "data:image/png;base64,AAAA");

    // Area 280,240 440x220 CSS px, at a device pixel ratio of 2.
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 560, 480, 880, 440, 0, 0, 880, 440);
    expect(toDataURL).toHaveBeenCalledWith("image/jpeg", 0.85);
    expect(shot).toEqual({
      dataUrl: TINY_JPEG_DATA_URL,
      region: { xPct: 0.2727, yPct: 0.2727, wPct: 0.4545, hPct: 0.4545 },
    });
    expect(close).toHaveBeenCalled();
  });

  it("scales a wide capture down to the maximum width", async () => {
    const { drawImage } = stubCanvas();

    await captureFromTab(
      rect(100, 100, 1000, 300),
      { maxWidth: 600, quality: 0.5 },
      async () => "data:image/png;base64,AAAA",
    );

    const [, , , sourceWidth, sourceHeight, , , width, height] = drawImage.mock.calls[0] as number[];
    expect(width).toBe(600);
    expect(height).toBe(Math.round((sourceHeight as number) * (600 / (sourceWidth as number))));
  });

  it("hides the chrome while the browser captures, and shows it again after", async () => {
    stubCanvas();
    const overlay = document.querySelector<HTMLElement>("#overlay") as HTMLElement;
    let opacityDuringCapture = "";

    await captureFromTab(rect(400, 300, 200, 100), undefined, async () => {
      opacityDuringCapture = overlay.style.opacity;
      return "data:image/png;base64,AAAA";
    });

    expect(opacityDuringCapture).toBe("0");
    expect(overlay.style.opacity).toBe("0.5");
  });

  it("shows the chrome again when the capture is refused", async () => {
    const overlay = document.querySelector<HTMLElement>("#overlay") as HTMLElement;

    await expect(
      captureFromTab(rect(400, 300, 200, 100), undefined, async () => {
        throw new Error("refused");
      }),
    ).rejects.toThrow("refused");

    expect(overlay.style.opacity).toBe("0.5");
  });

  it("does not ask for a capture of a rect that is off screen", async () => {
    const request = vi.fn();
    expect(await captureFromTab(rect(0, 900, 100, 100), undefined, request)).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("captureAnnotatedScreenshot", () => {
  it("falls back to rendering from the page when the tab capture is unavailable", async () => {
    // No extension API in this environment: the capture request throws.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fallback = { dataUrl: "data:image/jpeg;base64,fallback", region: { xPct: 0, yPct: 0, wPct: 1, hPct: 1 } };
    renderFromDom.mockResolvedValue(fallback);

    expect(await captureAnnotatedScreenshot(rect(400, 300, 200, 100), { quality: 0.7 })).toBe(fallback);
    expect(renderFromDom).toHaveBeenCalledWith(expect.objectContaining({ x: 400 }), { quality: 0.7 });
  });

  it("uses the tab capture when the extension answers", async () => {
    stubCanvas();
    vi.stubGlobal("chrome", {
      runtime: {
        id: "ext",
        sendMessage: async () => ({ ok: true, value: { dataUrl: "data:image/png;base64,AAAA" } }),
      },
    });

    const shot = await captureAnnotatedScreenshot(rect(400, 300, 200, 100));

    expect(shot?.dataUrl).toBe(TINY_JPEG_DATA_URL);
    expect(renderFromDom).not.toHaveBeenCalled();
  });
});
