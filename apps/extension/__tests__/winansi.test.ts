import { describe, expect, it } from "vitest";
import { canEncode, encode, normalizeText, winAnsiCode } from "../src/pdf/winansi.js";

describe("winAnsiCode", () => {
  it("maps ASCII and Latin-1 to themselves", () => {
    expect(winAnsiCode(0x41)).toBe(0x41);
    expect(winAnsiCode(0xe9)).toBe(0xe9); // é
    expect(winAnsiCode(0xd7)).toBe(0xd7); // ×
  });

  it("maps the Windows-1252 additions to their codes", () => {
    expect(winAnsiCode("€".codePointAt(0) as number)).toBe(0x80);
    expect(winAnsiCode("…".codePointAt(0) as number)).toBe(0x85);
    expect(winAnsiCode("’".codePointAt(0) as number)).toBe(0x92);
    expect(winAnsiCode("œ".codePointAt(0) as number)).toBe(0x9c);
    expect(winAnsiCode("—".codePointAt(0) as number)).toBe(0x97);
  });

  it("has no code for control characters or anything outside the encoding", () => {
    expect(winAnsiCode(0x0a)).toBeNull();
    expect(winAnsiCode(0x81)).toBeNull();
    expect(winAnsiCode("я".codePointAt(0) as number)).toBeNull();
    expect(winAnsiCode("日".codePointAt(0) as number)).toBeNull();
    expect(winAnsiCode("🙂".codePointAt(0) as number)).toBeNull();
  });
});

describe("canEncode", () => {
  it("accepts the languages the widget ships in Latin script", () => {
    for (const text of [
      "Déjà vu, l’œuvre « façade » coûte 49 €",
      "Straße, Größe, Übung",
      "¿Qué tal? ¡Mañana!",
      "Não, ação, coração",
      "Perché così – già",
      "line one\nline two",
    ]) {
      expect(canEncode(text), text).toBe(true);
    }
  });

  it("refuses text the standard fonts cannot write", () => {
    for (const text of ["Привет", "こんにちは", "안녕하세요", "Fixed 🙂", "a → b", "Łukasz"]) {
      expect(canEncode(text), text).toBe(false);
    }
  });
});

describe("normalizeText", () => {
  it("unifies line breaks and expands tabs", () => {
    expect(normalizeText("a\r\nb\rc\td")).toBe("a\nb\nc    d");
  });

  it("replaces typographic variants that would otherwise be unencodable", () => {
    // Narrow no-break space, thin space, non-breaking hyphen, zero-width space, soft hyphen, byte-order mark.
    const [narrow, thin, hyphen, zeroWidth, soft, mark] = [0x202f, 0x2009, 0x2011, 0x200b, 0xad, 0xfeff].map((code) =>
      String.fromCodePoint(code),
    );
    const pasted = `10${narrow}000${thin}€ non${hyphen}breaking zero${zeroWidth}width soft${soft}hyphen${mark}`;
    const normalized = normalizeText(pasted);
    expect(normalized).toBe("10 000 € non-breaking zerowidth softhyphen");
    expect(canEncode(normalized)).toBe(true);
  });

  it("keeps the joiners that shape emoji and connected scripts", () => {
    const joiner = String.fromCodePoint(0x200d);
    const nonJoiner = String.fromCodePoint(0x200c);
    const family = [0x1f468, 0x1f469, 0x1f467].map((code) => String.fromCodePoint(code)).join(joiner);
    // "mi-khaham" in Persian, written with a non-joiner between its two parts.
    const persian = `${String.fromCodePoint(0x0645, 0x06cc)}${nonJoiner}${String.fromCodePoint(0x062e, 0x0648, 0x0627, 0x0647, 0x0645)}`;

    expect(normalizeText(family)).toBe(family);
    expect(normalizeText(persian)).toBe(persian);
    // Neither can be written with the standard fonts, so both go to the rasteriser whole.
    expect(canEncode(normalizeText(family))).toBe(false);
    expect(canEncode(normalizeText(`a${joiner}b`))).toBe(false);
  });

  it("drops control characters", () => {
    const [nul, bell, del] = [0x00, 0x07, 0x7f].map((code) => String.fromCodePoint(code));
    expect(normalizeText(`a${nul}b${bell}c${del}`)).toBe("abc");
  });
});

describe("encode", () => {
  it("writes one code per character, and ? for a character without one", () => {
    expect(encode("A€é")).toEqual([0x41, 0x80, 0xe9]);
    expect(encode("a→🙂b")).toEqual([0x61, 0x3f, 0x3f, 0x62]);
  });
});
