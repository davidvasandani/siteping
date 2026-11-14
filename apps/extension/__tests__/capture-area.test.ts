import { describe, expect, it } from "vitest";
import { captureArea } from "../src/content/capture-area.js";

const viewport = { width: 1280, height: 720 };

describe("captureArea", () => {
  it("pads the rect by 60% of its size", () => {
    const area = captureArea({ x: 400, y: 300, width: 200, height: 100 }, viewport);

    expect(area).toMatchObject({ x: 280, y: 240, width: 440, height: 220 });
    expect(area?.region).toEqual({ xPct: 0.2727, yPct: 0.2727, wPct: 0.4545, hPct: 0.4545 });
  });

  it("gives a small rect at least 48px of context and a large one at most 280 by 220", () => {
    expect(captureArea({ x: 600, y: 300, width: 10, height: 10 }, viewport)).toMatchObject({
      x: 552,
      y: 252,
      width: 106,
      height: 106,
    });
    expect(captureArea({ x: 300, y: 250, width: 600, height: 400 }, { width: 4000, height: 4000 })).toMatchObject({
      x: 20,
      y: 30,
      width: 1160,
      height: 840,
    });
  });

  it("stops at the edges of the viewport", () => {
    const area = captureArea({ x: 10, y: 5, width: 100, height: 100 }, viewport);

    expect(area).toMatchObject({ x: 0, y: 0, width: 170, height: 165 });
    expect(area?.region).toEqual({ xPct: 0.0588, yPct: 0.0303, wPct: 0.5882, hPct: 0.6061 });
  });

  it("marks only the visible part of a rect that runs off screen", () => {
    const area = captureArea({ x: 1200, y: 650, width: 200, height: 200 }, viewport);

    expect(area).toMatchObject({ x: 1080, y: 530, width: 200, height: 190 });
    expect(area?.region).toEqual({ xPct: 0.6, yPct: 0.6316, wPct: 0.4, hPct: 0.3684 });
  });

  it("is null when the rect is entirely off screen or empty", () => {
    expect(captureArea({ x: 0, y: 800, width: 100, height: 100 }, viewport)).toBeNull();
    expect(captureArea({ x: -300, y: 0, width: 100, height: 100 }, viewport)).toBeNull();
    expect(captureArea({ x: 10, y: 10, width: 0, height: 50 }, viewport)).toBeNull();
  });
});
