import type { JpegInfo } from "./jpeg.js";
import type { Font } from "./metrics.js";
import { encode } from "./winansi.js";

/**
 * A PDF writer for what the feedback report draws: filled and outlined
 * shapes, text in two standard fonts, images and links. It writes PDF 1.4
 * with a classic cross-reference table, the form every reader accepts.
 *
 * Coordinates are in points from the top left of the page, y growing
 * downwards, as the layout thinks; they are flipped to PDF's bottom-left
 * origin where an operator is written.
 */

export interface PdfImage {
  /** Resource name the page content refers to. */
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

interface ImageData {
  dict: string;
  data: Uint8Array;
  /** Raw pixels are deflated at `finish`; JPEG data is stored as it is. */
  compress: boolean;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShapeStyle {
  /** `#rrggbb` */
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  /** Corner radius. */
  radius?: number;
  /** 0 to 1, applied to both fill and stroke. */
  opacity?: number;
}

export interface TextStyle {
  font: Font;
  size: number;
  /** `#rrggbb` */
  color: string;
  opacity?: number;
}

const FONT_RESOURCE: Record<Font, string> = { regular: "F1", bold: "F2" };

/** Distance of a Bézier control point from the corner that approximates a quarter circle. */
const KAPPA = 0.5523;

const ASCII = new TextEncoder();

/** A number as PDF writes one: no exponent, at most three decimals. */
function num(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function rgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => num(channel / 255)).join(" ");
}

/** A string between parentheses, with the three characters that would end or escape it escaped. */
function literal(text: string): string {
  return `(${text.replace(/[\\()]/g, "\\$&")})`;
}

/**
 * A text string for document metadata. ASCII is written literally; anything
 * else as UTF-16BE with a byte-order mark, which is how PDF spells Unicode
 * outside page content.
 */
function textString(text: string): string {
  if (/^[\x20-\x7e]*$/.test(text)) return literal(text);
  let hex = "FEFF";
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

function pdfDate(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return (
    `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** zlib-compress, the format `FlateDecode` reads. `null` where the platform has no `CompressionStream`. */
async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export class PdfPage {
  private readonly ops: string[] = [];
  /** Clickable areas, in PDF coordinates. */
  readonly links: { rect: [number, number, number, number]; url: string }[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly alphaResource: (opacity: number) => string,
  ) {}

  /** The page's content stream. */
  content(): string {
    return this.ops.join("\n");
  }

  private flip(y: number): number {
    return this.height - y;
  }

  /** Path of a box, rounded when `radius` is set. */
  private path({ x, y, width, height }: Box, radius = 0): string {
    const r = Math.min(radius, width / 2, height / 2);
    if (r <= 0) return `${num(x)} ${num(this.flip(y + height))} ${num(width)} ${num(height)} re`;
    const k = r * KAPPA;
    const right = x + width;
    const bottom = y + height;
    const point = (px: number, py: number): string => `${num(px)} ${num(this.flip(py))}`;
    const curve = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): string =>
      `${point(ax, ay)} ${point(bx, by)} ${point(cx, cy)} c`;
    return [
      `${point(x + r, y)} m`,
      `${point(right - r, y)} l`,
      curve(right - r + k, y, right, y + r - k, right, y + r),
      `${point(right, bottom - r)} l`,
      curve(right, bottom - r + k, right - r + k, bottom, right - r, bottom),
      `${point(x + r, bottom)} l`,
      curve(x + r - k, bottom, x, bottom - r + k, x, bottom - r),
      `${point(x, y + r)} l`,
      curve(x, y + r - k, x + r - k, y, x + r, y),
      "h",
    ].join(" ");
  }

  /** Fill and/or outline a box. */
  rect(box: Box, style: ShapeStyle): void {
    const paint = style.fill && style.stroke ? "B" : style.fill ? "f" : "S";
    this.ops.push(
      [
        "q",
        style.opacity !== undefined && style.opacity < 1 ? `/${this.alphaResource(style.opacity)} gs` : "",
        style.fill ? `${rgb(style.fill)} rg` : "",
        style.stroke ? `${rgb(style.stroke)} RG ${num(style.lineWidth ?? 1)} w` : "",
        this.path(box, style.radius),
        paint,
        "Q",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  circle(centerX: number, centerY: number, radius: number, fill: string): void {
    this.rect({ x: centerX - radius, y: centerY - radius, width: radius * 2, height: radius * 2 }, { fill, radius });
  }

  /** One line of text with its baseline at `baseline`. Characters outside WinAnsi are written as `?`. */
  text(text: string, x: number, baseline: number, style: TextStyle): void {
    if (!text) return;
    const hex = encode(text)
      .map((code) => code.toString(16).padStart(2, "0"))
      .join("");
    this.ops.push(
      [
        "q",
        style.opacity !== undefined && style.opacity < 1 ? `/${this.alphaResource(style.opacity)} gs` : "",
        `${rgb(style.color)} rg`,
        `BT /${FONT_RESOURCE[style.font]} ${num(style.size)} Tf ${num(x)} ${num(this.flip(baseline))} Td <${hex}> Tj ET`,
        "Q",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  /** Draw an image into a box, clipped to rounded corners when `radius` is set. */
  image(image: PdfImage, box: Box, radius = 0): void {
    this.ops.push(
      [
        "q",
        radius > 0 ? `${this.path(box, radius)} W n` : "",
        `${num(box.width)} 0 0 ${num(box.height)} ${num(box.x)} ${num(this.flip(box.y + box.height))} cm`,
        `/${image.name} Do`,
        "Q",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  /** Make a box open `url` when clicked. */
  link(box: Box, url: string): void {
    this.links.push({ rect: [box.x, this.flip(box.y + box.height), box.x + box.width, this.flip(box.y)], url });
  }
}

export interface PdfMetadata {
  title: string;
  createdAt: Date;
}

export class PdfDocument {
  /** The pages, in order. */
  readonly pages: PdfPage[] = [];
  private readonly images: ImageData[] = [];
  /** Opacities in use, by resource name. */
  private readonly alphas = new Map<number, string>();

  addPage(width: number, height: number): PdfPage {
    const page = new PdfPage(width, height, (opacity) => this.alpha(opacity));
    this.pages.push(page);
    return page;
  }

  private alpha(opacity: number): string {
    const key = Math.round(opacity * 100);
    let name = this.alphas.get(key);
    if (!name) {
      name = `A${key}`;
      this.alphas.set(key, name);
    }
    return name;
  }

  private addImage(width: number, height: number, colorSpace: string, filter: string, data: Uint8Array): PdfImage {
    this.images.push({
      dict: `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /${colorSpace} /BitsPerComponent 8${filter}`,
      data,
      compress: filter === "",
    });
    return { name: `Im${this.images.length}`, width, height };
  }

  /** Embed JPEG data as it is. */
  addJpeg(bytes: Uint8Array, info: JpegInfo): PdfImage {
    return this.addImage(
      info.width,
      info.height,
      info.components === 1 ? "DeviceGray" : "DeviceRGB",
      " /Filter /DCTDecode",
      bytes,
    );
  }

  /** Embed raw pixels: `width * height` RGB triples, row by row. */
  addRgb(pixels: Uint8Array, width: number, height: number): PdfImage {
    if (pixels.length !== width * height * 3) throw new Error("PdfDocument.addRgb: pixel data does not match the size");
    return this.addImage(width, height, "DeviceRGB", "", pixels);
  }

  /** Serialise the document. */
  async finish(metadata: PdfMetadata): Promise<Uint8Array> {
    // Object numbers are fixed up front so objects can refer to later ones.
    const CATALOG = 1;
    const PAGES = 2;
    const FONT_REGULAR = 3;
    const FONT_BOLD = 4;
    const RESOURCES = 5;
    const INFO = 6;
    let next = 7;
    const imageIds = this.images.map(() => next++);
    const pageIds = this.pages.map((page) => ({
      page: next++,
      content: next++,
      links: page.links.map(() => next++),
    }));

    const objects = new Map<number, (string | Uint8Array)[]>();
    const put = (id: number, ...parts: (string | Uint8Array)[]): void => void objects.set(id, parts);
    const stream = async (id: number, dict: string, data: Uint8Array, compress: boolean): Promise<void> => {
      const packed = compress ? await deflate(data) : null;
      const body = packed ?? data;
      put(
        id,
        `<< ${dict}${packed ? " /Filter /FlateDecode" : ""} /Length ${body.length} >>\nstream\n`,
        body,
        "\nendstream",
      );
    };

    put(CATALOG, `<< /Type /Catalog /Pages ${PAGES} 0 R >>`);
    put(
      PAGES,
      `<< /Type /Pages /Count ${this.pages.length} /Kids [${pageIds.map((ids) => `${ids.page} 0 R`).join(" ")}] >>`,
    );
    put(FONT_REGULAR, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    put(FONT_BOLD, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    put(
      RESOURCES,
      [
        "<<",
        `/Font << /F1 ${FONT_REGULAR} 0 R /F2 ${FONT_BOLD} 0 R >>`,
        `/XObject << ${imageIds.map((id, index) => `/Im${index + 1} ${id} 0 R`).join(" ")} >>`,
        `/ExtGState << ${[...this.alphas].map(([key, name]) => `/${name} << /ca ${num(key / 100)} /CA ${num(key / 100)} >>`).join(" ")} >>`,
        ">>",
      ].join(" "),
    );
    put(
      INFO,
      `<< /Title ${textString(metadata.title)} /Creator (SitePing) /Producer (SitePing) /CreationDate (${pdfDate(metadata.createdAt)}) >>`,
    );

    for (const [index, image] of this.images.entries()) {
      await stream(imageIds[index] as number, image.dict, image.data, image.compress);
    }
    for (const [index, page] of this.pages.entries()) {
      const ids = pageIds[index] as (typeof pageIds)[number];
      put(
        ids.page,
        [
          `<< /Type /Page /Parent ${PAGES} 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}]`,
          `/Resources ${RESOURCES} 0 R /Contents ${ids.content} 0 R`,
          ids.links.length > 0 ? `/Annots [${ids.links.map((id) => `${id} 0 R`).join(" ")}]` : "",
          ">>",
        ]
          .filter(Boolean)
          .join(" "),
      );
      await stream(ids.content, "", ASCII.encode(page.content()), true);
      for (const [linkIndex, link] of page.links.entries()) {
        put(
          ids.links[linkIndex] as number,
          `<< /Type /Annot /Subtype /Link /Rect [${link.rect.map(num).join(" ")}] /Border [0 0 0] /A << /S /URI /URI ${literal(link.url)} >> >>`,
        );
      }
    }

    // Header (the second line marks the file as binary), the objects in
    // number order, then the table of their byte offsets.
    const chunks: Uint8Array[] = [];
    let length = 0;
    const write = (part: string | Uint8Array): void => {
      const bytes = typeof part === "string" ? ASCII.encode(part) : part;
      chunks.push(bytes);
      length += bytes.length;
    };
    write("%PDF-1.4\n");
    write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    const offsets: number[] = [];
    for (let id = 1; id < next; id++) {
      offsets.push(length);
      write(`${id} 0 obj\n`);
      for (const part of objects.get(id) ?? []) write(part);
      write("\nendobj\n");
    }
    const xref = length;
    write(`xref\n0 ${next}\n0000000000 65535 f \n`);
    for (const offset of offsets) write(`${String(offset).padStart(10, "0")} 00000 n \n`);
    write(`trailer\n<< /Size ${next} /Root ${CATALOG} 0 R /Info ${INFO} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

    const file = new Uint8Array(length);
    let position = 0;
    for (const chunk of chunks) {
      file.set(chunk, position);
      position += chunk.length;
    }
    return file;
  }
}
