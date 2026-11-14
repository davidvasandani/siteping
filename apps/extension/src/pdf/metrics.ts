import { encode } from "./winansi.js";

/**
 * Advance widths of Helvetica and Helvetica-Bold for WinAnsi codes 32 to
 * 255, in thousandths of the font size. A PDF reader has these fonts built
 * in; the file only names them, so the layout needs the widths to wrap and
 * align text itself.
 *
 * Generated from Adobe's Core 14 AFM files (Helvetica.afm and
 * Helvetica-Bold.afm, © Adobe Systems Incorporated) by glyph name. Codes
 * WinAnsi leaves undefined are 0.
 */
// biome-ignore format: a table
const REGULAR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,0,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
// biome-ignore format: a table
const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,0,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];

export type Font = "regular" | "bold";

const WIDTHS: Record<Font, readonly number[]> = { regular: REGULAR, bold: BOLD };

/** Height of capital letters as a fraction of the font size, used to centre text vertically. */
export const CAP_HEIGHT = 0.718;

const ELLIPSIS = "…";

/** Width of `text` in points when set in `font` at `size`. */
export function textWidth(text: string, font: Font, size: number): number {
  const widths = WIDTHS[font];
  let total = 0;
  for (const code of encode(text)) total += widths[code - 32] ?? 0;
  return (total * size) / 1000;
}

/** The longest prefix of `word` that fits `maxWidth`, at least one character so wrapping always advances. */
function fitPrefix(word: string, font: Font, size: number, maxWidth: number): string {
  const chars = [...word];
  let end = 1;
  while (end < chars.length && textWidth(chars.slice(0, end + 1).join(""), font, size) <= maxWidth) end += 1;
  return chars.slice(0, end).join("");
}

/**
 * Break `text` into lines no wider than `maxWidth`. Line breaks in the text
 * are kept (an empty line stays an empty line). Words are kept whole; one
 * that is wider than a line by itself, such as a long address, is broken
 * where it stops fitting.
 */
export function wrapText(text: string, font: Font, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      let rest = word;
      const candidate = line ? `${line} ${rest}` : rest;
      if (textWidth(candidate, font, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      while (textWidth(rest, font, size) > maxWidth) {
        const head = fitPrefix(rest, font, size, maxWidth);
        // A single character wider than the line: it gets the line to itself.
        if (head.length === rest.length) break;
        lines.push(head);
        rest = rest.slice(head.length);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

/** `text` cut to fit `maxWidth` on one line, ending in an ellipsis when something was cut. */
export function truncateText(text: string, font: Font, size: number, maxWidth: number): string {
  if (textWidth(text, font, size) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 0 && textWidth(chars.join("") + ELLIPSIS, font, size) > maxWidth) chars.pop();
  return chars.join("").trimEnd() + ELLIPSIS;
}
