/**
 * WinAnsiEncoding (Windows-1252), the encoding the PDF's standard fonts are
 * used with. It covers Western European languages. Text outside it cannot be
 * written with those fonts at all, which is what `canEncode` tells the layout
 * so it can draw that text as an image instead.
 */

/** Unicode code point to WinAnsi code for the 0x80–0x9F range, which is where Windows-1252 departs from Latin-1. */
const HIGH: ReadonlyMap<number, number> = new Map([
  [0x20ac, 0x80], // €
  [0x201a, 0x82], // ‚
  [0x0192, 0x83], // ƒ
  [0x201e, 0x84], // „
  [0x2026, 0x85], // …
  [0x2020, 0x86], // †
  [0x2021, 0x87], // ‡
  [0x02c6, 0x88], // ˆ
  [0x2030, 0x89], // ‰
  [0x0160, 0x8a], // Š
  [0x2039, 0x8b], // ‹
  [0x0152, 0x8c], // Œ
  [0x017d, 0x8e], // Ž
  [0x2018, 0x91], // ‘
  [0x2019, 0x92], // ’
  [0x201c, 0x93], // “
  [0x201d, 0x94], // ”
  [0x2022, 0x95], // •
  [0x2013, 0x96], // –
  [0x2014, 0x97], // —
  [0x02dc, 0x98], // ˜
  [0x2122, 0x99], // ™
  [0x0161, 0x9a], // š
  [0x203a, 0x9b], // ›
  [0x0153, 0x9c], // œ
  [0x017e, 0x9e], // ž
  [0x0178, 0x9f], // Ÿ
]);

/** Code written for a character that has none. */
const UNKNOWN = 0x3f; // ?

/** The WinAnsi code of a code point, or `null` when the encoding has none. */
export function winAnsiCode(codePoint: number): number | null {
  if ((codePoint >= 0x20 && codePoint <= 0x7e) || (codePoint >= 0xa0 && codePoint <= 0xff)) return codePoint;
  return HIGH.get(codePoint) ?? null;
}

/**
 * Text as the layout handles it: one kind of line break, and the invisible
 * or typographic variants of ordinary characters replaced by the ordinary
 * one, so that a non-breaking hyphen or a narrow space pasted from a word
 * processor does not push a whole paragraph out of the standard fonts.
 */
export function normalizeText(text: string): string {
  let normalized = "";
  for (const char of text.replace(/\r\n?/g, "\n")) {
    normalized += normalizeChar(char);
  }
  return normalized;
}

/**
 * One character as the layout keeps it. Written as code points on purpose:
 * most of these are invisible, and a source file should not contain them.
 */
function normalizeChar(char: string): string {
  const code = char.codePointAt(0) as number;
  if (code === 0x0a) return char;
  if (code === 0x09) return "    ";
  // Control characters.
  if (code < 0x20 || code === 0x7f) return "";
  // Spaces of other widths: en and em spaces, thin, narrow no-break, ideographic.
  if ((code >= 0x2000 && code <= 0x200a) || code === 0x202f || code === 0x205f || code === 0x3000) return " ";
  // Hyphen and non-breaking hyphen.
  if (code === 0x2010 || code === 0x2011) return "-";
  // Characters with no width and no effect on their neighbours: soft hyphen,
  // zero-width space, word joiner, byte-order mark. The zero-width joiner and
  // non-joiner (0x200d, 0x200c) are kept: they make one emoji out of several
  // and decide how Persian or Arabic letters connect. A paragraph holding one
  // is drawn by the system's fonts, which honour them.
  if (code === 0xad || code === 0x200b || code === 0x2060 || code === 0xfeff) return "";
  return char;
}

/** Whether every character of `text` (already normalised, line breaks aside) exists in WinAnsi. */
export function canEncode(text: string): boolean {
  for (const char of text) {
    if (char !== "\n" && winAnsiCode(char.codePointAt(0) as number) === null) return false;
  }
  return true;
}

/** WinAnsi codes of `text`; a character without one becomes `?`. */
export function encode(text: string): number[] {
  const codes: number[] = [];
  for (const char of text) codes.push(winAnsiCode(char.codePointAt(0) as number) ?? UNKNOWN);
  return codes;
}
