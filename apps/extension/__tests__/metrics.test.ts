import { describe, expect, it } from "vitest";
import { textWidth, truncateText, wrapText } from "../src/pdf/metrics.js";

describe("textWidth", () => {
  it("matches the published Helvetica metrics", () => {
    // AFM: space 278, A 667, a 556, W 944, i 222, @ 1015, é 556, € 556.
    expect(textWidth(" ", "regular", 1000)).toBe(278);
    expect(textWidth("A", "regular", 1000)).toBe(667);
    expect(textWidth("a", "regular", 1000)).toBe(556);
    expect(textWidth("W", "regular", 1000)).toBe(944);
    expect(textWidth("i", "regular", 1000)).toBe(222);
    expect(textWidth("@", "regular", 1000)).toBe(1015);
    expect(textWidth("é", "regular", 1000)).toBe(556);
    expect(textWidth("€", "regular", 1000)).toBe(556);
  });

  it("matches the published Helvetica-Bold metrics", () => {
    // AFM: A 722, a 556, i 278, @ 975, ! 333.
    expect(textWidth("A", "bold", 1000)).toBe(722);
    expect(textWidth("a", "bold", 1000)).toBe(556);
    expect(textWidth("i", "bold", 1000)).toBe(278);
    expect(textWidth("@", "bold", 1000)).toBe(975);
    expect(textWidth("!", "bold", 1000)).toBe(333);
  });

  it("adds up characters and scales with the size", () => {
    expect(textWidth("Hi", "regular", 10)).toBeCloseTo((722 + 222) / 100);
    expect(textWidth("", "regular", 12)).toBe(0);
  });
});

describe("wrapText", () => {
  const fits = (lines: string[], width: number): boolean =>
    lines.every((line) => textWidth(line, "regular", 10) <= width);

  it("breaks between words, never wider than the limit", () => {
    const text = "The quick brown fox jumps over the lazy dog and keeps running through the forest";
    const lines = wrapText(text, "regular", 10, 120);

    expect(lines.length).toBeGreaterThan(2);
    expect(fits(lines, 120)).toBe(true);
    expect(lines.join(" ")).toBe(text);
  });

  it("keeps the text's own line breaks, empty lines included", () => {
    expect(wrapText("one\n\ntwo", "regular", 10, 500)).toEqual(["one", "", "two"]);
  });

  it("breaks a word that is wider than a line", () => {
    const url = "https://example.com/a/very/long/path/without/any/space/in/it/at/all";
    const lines = wrapText(`see ${url} now`, "regular", 10, 100);

    expect(fits(lines, 100)).toBe(true);
    expect(lines.join("").replace(/ /g, "")).toBe(`see${url}now`);
  });

  it("always advances, even when not one character fits", () => {
    expect(wrapText("WWW", "regular", 10, 1)).toEqual(["W", "W", "W"]);
  });
});

describe("truncateText", () => {
  it("returns text that fits unchanged", () => {
    expect(truncateText("short", "regular", 10, 200)).toBe("short");
  });

  it("cuts and ends in an ellipsis, within the limit", () => {
    const cut = truncateText("/blog/2026/11/a-very-long-article-slug-that-goes-on", "regular", 10, 100);

    expect(cut.endsWith("…")).toBe(true);
    expect(textWidth(cut, "regular", 10)).toBeLessThanOrEqual(100);
    expect(cut.length).toBeGreaterThan(5);
  });
});
