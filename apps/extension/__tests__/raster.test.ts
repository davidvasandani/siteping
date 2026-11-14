import { describe, expect, it } from "vitest";
import { wrapMeasured } from "../src/pdf/raster.js";

/** Every character one unit wide: a line holds as many characters as the limit. */
const measure = (text: string): number => [...text].length;

describe("wrapMeasured", () => {
  it("breaks at spaces in scripts that use them", () => {
    expect(wrapMeasured("Привет как дела сегодня", measure, 11)).toEqual(["Привет как", "дела", "сегодня"]);
  });

  it("breaks between any two characters in scripts written without spaces", () => {
    expect(wrapMeasured("このボタンが動きません", measure, 4)).toEqual(["このボタ", "ンが動き", "ません"]);
  });

  it("breaks a word longer than a line", () => {
    expect(wrapMeasured("абвгдежзик", measure, 4)).toEqual(["абвг", "дежз", "ик"]);
  });

  it("never splits an emoji made of several code points", () => {
    // Man, woman, girl, joined by zero-width joiners: one character to a reader.
    const joiner = String.fromCodePoint(0x200d);
    const family = [0x1f468, 0x1f469, 0x1f467].map((code) => String.fromCodePoint(code)).join(joiner);
    const lines = wrapMeasured(`ab ${family}${family}`, () => 99, 1);
    expect(lines.join("")).toContain(family);
    expect(lines.every((line) => !line.startsWith(joiner) && !line.endsWith(joiner))).toBe(true);
  });

  it("returns one line for text that fits", () => {
    expect(wrapMeasured("короткий", measure, 50)).toEqual(["короткий"]);
  });
});
