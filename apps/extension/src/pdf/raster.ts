import { decodeDataUrl } from "./jpeg.js";
import type { RasterLine, RasterRequest } from "./report.js";

/**
 * Browser half of the PDF export: what needs a canvas. The report draws text
 * with the PDF reader's built-in fonts where it can; a paragraph outside
 * their reach comes here to be drawn with the system's fonts, which cover
 * every script the reviewer's machine can show, and is placed as an image.
 */

/** Pixels per point: 216 dpi, sharp in print and on high-density screens. */
const SCALE = 3;

const FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Hiragino Sans", "Noto Sans CJK JP", "Malgun Gothic", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/**
 * Whether a character belongs to a script written without spaces (kana, CJK
 * ideographs, hangul, full-width forms), where a line may break between any
 * two characters.
 */
function breaksAnywhere(char: string): boolean {
  const code = char.codePointAt(0) as number;
  return (
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xff00 && code <= 0xffef)
  );
}

/** User-perceived characters: an emoji made of several code points must not be split. */
function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((part) => part.segment);
  }
  return [...text];
}

/** Break `text` into lines no wider than `maxWidth`, at spaces where the script has them. */
export function wrapMeasured(text: string, measure: (text: string) => number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const grapheme of graphemes(text)) {
    if (line === "" || measure(line + grapheme) <= maxWidth) {
      line += grapheme;
      continue;
    }
    const space = line.lastIndexOf(" ");
    const word = line.slice(space + 1);
    if (space > 0 && ![...word, ...grapheme].some(breaksAnywhere)) {
      // Take the unfinished word down to the next line.
      lines.push(line.slice(0, space));
      line = word + grapheme;
    } else {
      lines.push(line.trimEnd());
      line = grapheme === " " ? "" : grapheme;
    }
  }
  lines.push(line);
  return lines;
}

/** Draw a paragraph as one image per line. Empty when the browser gives no canvas. */
export function rasterizeText(request: RasterRequest): RasterLine[] {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  const font = `${request.bold ? 600 : 400} ${request.fontSize * SCALE}px ${FONT_STACK}`;
  context.font = font;
  const maxWidth = request.maxWidth * SCALE;
  const height = Math.ceil(request.lineHeight * SCALE);

  return wrapMeasured(request.text, (text) => context.measureText(text).width, maxWidth).map((line) => {
    const width = Math.max(1, Math.ceil(Math.min(maxWidth, context.measureText(line).width)));
    // Resizing clears the canvas and resets its state.
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = request.background;
    context.fillRect(0, 0, width, height);
    context.font = font;
    context.fillStyle = request.color;
    context.textBaseline = "middle";
    context.fillText(line, 0, height / 2);

    const rgba = context.getImageData(0, 0, width, height).data;
    const rgb = new Uint8Array(width * height * 3);
    for (let from = 0, to = 0; from < rgba.length; from += 4) {
      rgb[to++] = rgba[from] as number;
      rgb[to++] = rgba[from + 1] as number;
      rgb[to++] = rgba[from + 2] as number;
    }
    return { width: width / SCALE, height: request.lineHeight, pixelWidth: width, pixelHeight: height, rgb };
  });
}

/**
 * Re-encode an inline image as JPEG, for a screenshot the PDF cannot embed
 * as stored (a PNG, a CMYK JPEG). `null` when the browser cannot decode it.
 */
export async function toJpeg(dataUrl: string): Promise<Uint8Array | null> {
  try {
    const decoded = decodeDataUrl(dataUrl);
    if (!decoded) return null;
    const bitmap = await createImageBitmap(new Blob([decoded.bytes as BlobPart], { type: decoded.mediaType }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    // JPEG has no transparency: put white behind what was see-through.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return decodeDataUrl(canvas.toDataURL("image/jpeg", 0.9))?.bytes ?? null;
  } catch {
    return null;
  }
}
