import { FEEDBACK_STATUSES, FEEDBACK_TYPES } from "@siteping/core";
import { ACCENT, formatDate, STATUS_COLOR, STATUS_LABEL, TYPE_COLOR, TYPE_LABEL } from "../shared/labels.js";
import { countItems, plural, type Report, type ReportItem } from "../shared/report.js";
import { decodeDataUrl, parseJpeg } from "./jpeg.js";
import { CAP_HEIGHT, type Font, textWidth, truncateText, wrapText } from "./metrics.js";
import { canEncode, normalizeText } from "./winansi.js";
import { PdfDocument, type PdfImage, type PdfPage } from "./writer.js";

/**
 * The feedback report: a summary header, then one card per feedback.
 *
 * Text is written with the reader's built-in Helvetica, which only knows
 * Western European characters. A paragraph it cannot write (Cyrillic, CJK,
 * emoji) is handed to `deps.rasterize`, which draws it with the system's
 * fonts, and is placed as an image; the review page supplies that function.
 * Without it such characters come out as `?`.
 */

/** A paragraph to draw as pixels because the standard fonts cannot write it. */
export interface RasterRequest {
  text: string;
  /** Width to wrap at, in points. */
  maxWidth: number;
  fontSize: number;
  lineHeight: number;
  bold: boolean;
  /** `#rrggbb` */
  color: string;
  background: string;
}

/** One rendered line. `width` and `height` are its size on the page, in points. */
export interface RasterLine {
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  /** `pixelWidth * pixelHeight` RGB triples. */
  rgb: Uint8Array;
}

export interface ReportDeps {
  rasterize?: (request: RasterRequest) => RasterLine[] | Promise<RasterLine[]>;
  /** Re-encode a screenshot that is not a plain JPEG. `null` leaves the screenshot out. */
  toJpeg?: (dataUrl: string) => Promise<Uint8Array | null>;
  /** Called between cards so a long export can let the page breathe. */
  pause?: () => Promise<void>;
}

// A4, in points.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
/** Lowest point content may reach; the footer sits below it. */
const CONTENT_BOTTOM = PAGE_HEIGHT - 52;

const INK = "#0f172a";
const BODY = "#1e293b";
const MUTED = "#64748b";
const HAIRLINE = "#e2e8f0";
const WHITE = "#ffffff";

const CARD_GAP = 12;
const CARD_PAD_TOP = 14;
const CARD_PAD_BOTTOM = 14;
/** Left padding leaves room for the coloured stripe. */
const CARD_PAD_LEFT = 18;
const CARD_PAD_RIGHT = 14;
const INNER_WIDTH = CONTENT_WIDTH - CARD_PAD_LEFT - CARD_PAD_RIGHT;
const SCREENSHOT_MAX_HEIGHT = 250;

interface TextSpec {
  font: Font;
  size: number;
  lineHeight: number;
  color: string;
}

const MESSAGE: TextSpec = { font: "regular", size: 10.5, lineHeight: 15, color: BODY };
const COMMENT: TextSpec = { font: "regular", size: 9.5, lineHeight: 13.5, color: BODY };
const SMALL: TextSpec = { font: "regular", size: 8.5, lineHeight: 12, color: MUTED };
const SMALL_BOLD: TextSpec = { ...SMALL, font: "bold", color: INK };

/**
 * A horizontal slice of a card. Cards are placed row by row, so one that is
 * taller than a page can continue on the next without a row being cut.
 */
interface Row {
  height: number;
  /** Draw at the row's top-left corner; absent for plain spacing. */
  draw?: (page: PdfPage, x: number, y: number) => void;
}

const gap = (height: number): Row => ({ height });

/** Baseline that centres capital letters of `size` in a row of `height` starting at `top`. */
const centred = (top: number, height: number, size: number): number => top + (height + size * CAP_HEIGHT) / 2;

class ReportBuilder {
  private readonly doc = new PdfDocument();
  private page: PdfPage;
  /** Top of the free space on the current page. */
  private cursor = 0;

  constructor(
    private readonly report: Report,
    private readonly deps: ReportDeps,
  ) {
    this.page = this.doc.addPage(PAGE_WIDTH, PAGE_HEIGHT);
  }

  private newPage(): void {
    this.page = this.doc.addPage(PAGE_WIDTH, PAGE_HEIGHT);
    this.cursor = MARGIN;
  }

  // -------------------------------------------------------------------------
  // Text
  // -------------------------------------------------------------------------

  /**
   * Rows for `text` wrapped to `maxWidth`: real text where the standard
   * fonts can write the paragraph, an image of it otherwise.
   */
  private async textRows(text: string, spec: TextSpec, maxWidth: number, indent = 0): Promise<Row[]> {
    const rows: Row[] = [];
    for (const paragraph of normalizeText(text).split("\n")) {
      const drawn = canEncode(paragraph) ? [] : await this.rasterRows(paragraph, spec, maxWidth, indent);
      if (drawn.length > 0) {
        rows.push(...drawn);
        continue;
      }
      for (const line of wrapText(paragraph, spec.font, spec.size, maxWidth)) {
        rows.push({
          height: spec.lineHeight,
          draw: (page, x, y) =>
            page.text(line, x + indent, centred(y, spec.lineHeight, spec.size), {
              font: spec.font,
              size: spec.size,
              color: spec.color,
            }),
        });
      }
    }
    return rows;
  }

  /** `paragraph` as image rows; none when there is no rasteriser or it drew nothing. */
  private async rasterRows(paragraph: string, spec: TextSpec, maxWidth: number, indent: number): Promise<Row[]> {
    const lines =
      (await this.deps.rasterize?.({
        text: paragraph,
        maxWidth,
        fontSize: spec.size,
        lineHeight: spec.lineHeight,
        bold: spec.font === "bold",
        color: spec.color,
        background: WHITE,
      })) ?? [];
    return lines.map((line) => {
      const image = this.doc.addRgb(line.rgb, line.pixelWidth, line.pixelHeight);
      return {
        height: line.height,
        draw: (page: PdfPage, x: number, y: number) =>
          page.image(image, { x: x + indent, y, width: line.width, height: line.height }),
      };
    });
  }

  /** A single line cut to `maxWidth`, as a row. Falls back to an image like {@link textRows}, keeping its first line. */
  private async lineRow(text: string, spec: TextSpec, maxWidth: number): Promise<Row> {
    const line = normalizeText(text).replace(/\n/g, " ");
    if (!canEncode(line)) {
      const [first] = await this.rasterRows(line, spec, maxWidth, 0);
      if (first) return first;
    }
    const shown = truncateText(line, spec.font, spec.size, maxWidth);
    return {
      height: spec.lineHeight,
      draw: (page, x, y) =>
        page.text(shown, x, centred(y, spec.lineHeight, spec.size), {
          font: spec.font,
          size: spec.size,
          color: spec.color,
        }),
    };
  }

  // -------------------------------------------------------------------------
  // Header
  // -------------------------------------------------------------------------

  private drawHeader(): void {
    const { page, report } = this;
    const counts = countItems(report.items);
    const BAND = 150;

    page.rect({ x: 0, y: 0, width: PAGE_WIDTH, height: BAND }, { fill: ACCENT });
    page.text("SITEPING  ·  FEEDBACK REPORT", MARGIN, 46, { font: "bold", size: 8.5, color: WHITE, opacity: 0.8 });
    page.text(truncateText(normalizeText(report.title), "bold", 26, CONTENT_WIDTH), MARGIN, 80, {
      font: "bold",
      size: 26,
      color: WHITE,
    });
    const summary = [
      `Exported ${formatDate(report.generatedAt)}`,
      plural(report.items.length, "item"),
      ...(report.siteCount > 1 ? [plural(report.siteCount, "site")] : []),
    ].join("  ·  ");
    page.text(summary, MARGIN, 101, { font: "regular", size: 10.5, color: WHITE, opacity: 0.9 });

    // Totals, on tiles that straddle the band's lower edge.
    const tiles: { label: string; value: number; color: string }[] = [
      { label: "Total", value: report.items.length, color: INK },
      ...FEEDBACK_STATUSES.map((status) => ({
        label: STATUS_LABEL[status],
        value: counts.status[status],
        color: STATUS_COLOR[status],
      })),
    ];
    const TILE_GAP = 10;
    const TILE_HEIGHT = 58;
    const tileWidth = (CONTENT_WIDTH - TILE_GAP * (tiles.length - 1)) / tiles.length;
    const tileTop = BAND - 28;
    for (const [index, tile] of tiles.entries()) {
      const x = MARGIN + index * (tileWidth + TILE_GAP);
      // A soft edge below the tile, in place of a shadow.
      page.rect(
        { x, y: tileTop + 1.5, width: tileWidth, height: TILE_HEIGHT },
        { fill: INK, radius: 9, opacity: 0.08 },
      );
      page.rect(
        { x, y: tileTop, width: tileWidth, height: TILE_HEIGHT },
        { fill: WHITE, stroke: HAIRLINE, lineWidth: 0.75, radius: 8 },
      );
      page.text(String(tile.value), x + 12, tileTop + 28, { font: "bold", size: 20, color: tile.color });
      page.text(tile.label, x + 12, tileTop + 45, { font: "regular", size: 8.5, color: MUTED });
    }

    // Breakdown by type: a coloured dot, the name, the count.
    let x = MARGIN;
    const baseline = tileTop + TILE_HEIGHT + 26;
    for (const type of FEEDBACK_TYPES) {
      const label = `${TYPE_LABEL[type]}  ${counts.type[type]}`;
      page.circle(x + 3.5, baseline - 3, 3.5, TYPE_COLOR[type]);
      page.text(label, x + 12, baseline, { font: "regular", size: 9, color: BODY });
      x += 12 + textWidth(label, "regular", 9) + 20;
    }
    this.cursor = baseline + 22;
  }

  // -------------------------------------------------------------------------
  // Cards
  // -------------------------------------------------------------------------

  private chip(page: PdfPage, x: number, y: number, label: string, color: string): number {
    const SIZE = 8;
    const HEIGHT = 16;
    const width = textWidth(label, "bold", SIZE) + 14;
    page.rect({ x, y, width, height: HEIGHT }, { fill: color, radius: HEIGHT / 2, opacity: 0.12 });
    page.text(label, x + 7, centred(y, HEIGHT, SIZE), { font: "bold", size: SIZE, color });
    return width;
  }

  private async image(dataUrl: string | null | undefined): Promise<PdfImage | null> {
    if (!dataUrl) return null;
    const decoded = decodeDataUrl(dataUrl);
    let bytes = decoded?.mediaType === "image/jpeg" ? decoded.bytes : null;
    let info = bytes ? parseJpeg(bytes) : null;
    if (!info && this.deps.toJpeg) {
      bytes = await this.deps.toJpeg(dataUrl);
      info = bytes ? parseJpeg(bytes) : null;
    }
    return bytes && info ? this.doc.addJpeg(bytes, info) : null;
  }

  private screenshot(item: ReportItem): Promise<PdfImage | null> {
    return this.image(item.screenshot?.dataUrl);
  }

  private async cardRows(item: ReportItem): Promise<Row[]> {
    const rows: Row[] = [];
    const date = formatDate(item.createdAt);

    // Number, type, status; the date on the right.
    rows.push({
      height: 20,
      draw: (page, x, y) => {
        const number = String(item.number);
        const radius = Math.max(10, textWidth(number, "bold", 9) / 2 + 5);
        page.circle(x + radius, y + 10, radius, INK);
        page.text(number, x + radius - textWidth(number, "bold", 9) / 2, centred(y, 20, 9), {
          font: "bold",
          size: 9,
          color: WHITE,
        });
        let chipX = x + radius * 2 + 8;
        chipX += this.chip(page, chipX, y + 2, TYPE_LABEL[item.type], TYPE_COLOR[item.type]) + 6;
        this.chip(page, chipX, y + 2, STATUS_LABEL[item.status], STATUS_COLOR[item.status]);
        page.text(date, x + INNER_WIDTH - textWidth(date, "regular", 8.5), centred(y, 20, 8.5), {
          font: "regular",
          size: 8.5,
          color: MUTED,
        });
      },
    });

    if (item.recording) {
      const seconds = Math.max(1, Math.round(item.recording.durationMs / 1000));
      const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      rows.push(
        gap(8),
        ...(await this.textRows(
          `Screen recording attached · ${duration} · Video remains in SitePing on the reviewer’s machine.`,
          SMALL_BOLD,
          INNER_WIDTH,
        )),
      );
    }
    rows.push(gap(9), ...(await this.textRows(item.message, MESSAGE, INNER_WIDTH)), gap(8));

    // Where and who. The page is a link when the record has a safe address.
    const pageLabel = normalizeText(item.pageLabel).replace(/\n/g, " ");
    const by = `${normalizeText(item.author).replace(/\n/g, " ")}  ·  ${item.viewport}`;
    const byRow = await this.lineRow(by, SMALL, INNER_WIDTH * 0.45);
    const pageRow = await this.lineRow(pageLabel, { ...SMALL, color: ACCENT }, INNER_WIDTH * 0.52);
    rows.push({
      height: SMALL.lineHeight,
      draw: (page, x, y) => {
        pageRow.draw?.(page, x, y);
        if (item.pageUrl) {
          const shown = truncateText(pageLabel, SMALL.font, SMALL.size, INNER_WIDTH * 0.52);
          const width = canEncode(pageLabel) ? textWidth(shown, SMALL.font, SMALL.size) : INNER_WIDTH * 0.52;
          page.link({ x, y, width, height: SMALL.lineHeight }, item.pageUrl);
        }
        const byWidth = canEncode(by)
          ? textWidth(truncateText(by, SMALL.font, SMALL.size, INNER_WIDTH * 0.45), SMALL.font, SMALL.size)
          : INNER_WIDTH * 0.45;
        byRow.draw?.(page, x + INNER_WIDTH - byWidth, y);
      },
    });

    const image = await this.screenshot(item);
    if (image) {
      // Never larger than it was on screen (a CSS pixel is 0.75pt): a small
      // capture blown up to the card's width would only be blurred.
      const scale = Math.min(INNER_WIDTH / image.width, SCREENSHOT_MAX_HEIGHT / image.height, 0.75);
      const width = image.width * scale;
      const height = image.height * scale;
      const region = item.recording?.posterDataUrl ? null : item.screenshot?.region;
      rows.push(gap(11), {
        height,
        draw: (page, x, y) => {
          const box = { x, y, width, height };
          page.image(image, box, 6);
          if (region) {
            // The annotated area, drawn inside the picture's bounds.
            page.rect(
              {
                x: x + region.xPct * width,
                y: y + region.yPct * height,
                width: Math.max(2, region.wPct * width),
                height: Math.max(2, region.hPct * height),
              },
              { fill: ACCENT, opacity: 0.12, radius: 2 },
            );
            page.rect(
              {
                x: x + region.xPct * width,
                y: y + region.yPct * height,
                width: Math.max(2, region.wPct * width),
                height: Math.max(2, region.hPct * height),
              },
              { stroke: ACCENT, lineWidth: 1.5, radius: 2 },
            );
          }
          page.rect(box, { stroke: HAIRLINE, lineWidth: 0.75, radius: 6 });
        },
      });
    }

    const poster = await this.image(item.recording?.posterDataUrl);
    if (poster) {
      const scale = Math.min(INNER_WIDTH / poster.width, 180 / poster.height, 0.75);
      const width = poster.width * scale;
      const height = poster.height * scale;
      rows.push(gap(8), {
        height,
        draw: (page, x, y) => {
          page.image(poster, { x, y, width, height }, 6);
          page.rect({ x, y, width, height }, { stroke: HAIRLINE, lineWidth: 0.75, radius: 6 });
        },
      });
    }

    if (item.comments.length > 0) {
      rows.push(gap(12), {
        height: 1,
        draw: (page, x, y) => page.rect({ x, y, width: INNER_WIDTH, height: 0.75 }, { fill: HAIRLINE }),
      });
      for (const comment of item.comments) {
        const head = `${normalizeText(comment.author).replace(/\n/g, " ")}  ·  ${formatDate(comment.createdAt)}`;
        rows.push(
          gap(9),
          await this.lineRow(head, SMALL_BOLD, INNER_WIDTH),
          gap(2),
          ...(await this.textRows(comment.body, COMMENT, INNER_WIDTH)),
        );
      }
    }
    return rows;
  }

  /** Draw rows as one piece of a card, with its frame, at the cursor. */
  private drawSegment(rows: readonly Row[], color: string): void {
    const height = CARD_PAD_TOP + rows.reduce((sum, row) => sum + row.height, 0) + CARD_PAD_BOTTOM;
    const top = this.cursor;
    this.page.rect(
      { x: MARGIN, y: top, width: CONTENT_WIDTH, height },
      { fill: WHITE, stroke: HAIRLINE, lineWidth: 0.75, radius: 8 },
    );
    this.page.rect({ x: MARGIN + 6, y: top + 12, width: 3, height: height - 24 }, { fill: color, radius: 1.5 });
    let y = top + CARD_PAD_TOP;
    for (const row of rows) {
      row.draw?.(this.page, MARGIN + CARD_PAD_LEFT, y);
      y += row.height;
    }
    this.cursor = top + height + CARD_GAP;
  }

  /**
   * Place a card: on this page when it fits, on a new one when it fits a
   * whole page, and row by row across pages only when it is taller than one.
   */
  private placeCard(rows: Row[], color: string): void {
    const frame = CARD_PAD_TOP + CARD_PAD_BOTTOM;
    const height = frame + rows.reduce((sum, row) => sum + row.height, 0);
    if (this.cursor + height > CONTENT_BOTTOM && height <= CONTENT_BOTTOM - MARGIN) this.newPage();
    if (this.cursor + height <= CONTENT_BOTTOM) {
      this.drawSegment(rows, color);
      return;
    }
    let rest = rows;
    while (rest.length > 0) {
      let used = frame;
      let count = 0;
      while (count < rest.length && this.cursor + used + (rest[count] as Row).height <= CONTENT_BOTTOM) {
        used += (rest[count] as Row).height;
        count += 1;
      }
      if (count === 0) {
        // Not even one row fits what is left of this page. On a fresh page
        // one always does: no single row is taller than a page.
        if (this.cursor > MARGIN) {
          this.newPage();
          continue;
        }
        count = 1;
      }
      // Spacing at the edge of a piece would only add empty space to it.
      const piece = rest.slice(0, count);
      rest = rest.slice(count);
      while (rest[0] && !rest[0].draw) rest = rest.slice(1);
      this.drawSegment(piece, color);
      if (rest.length > 0) this.newPage();
    }
  }

  private drawFooters(): void {
    const total = this.doc.pages.length;
    const left = truncateText(`SitePing  ·  ${normalizeText(this.report.title)}`, "regular", 8, CONTENT_WIDTH * 0.7);
    for (const [index, page] of this.doc.pages.entries()) {
      const label = `Page ${index + 1} of ${total}`;
      page.rect({ x: MARGIN, y: PAGE_HEIGHT - 40, width: CONTENT_WIDTH, height: 0.5 }, { fill: HAIRLINE });
      page.text(left, MARGIN, PAGE_HEIGHT - 26, { font: "regular", size: 8, color: MUTED });
      page.text(label, PAGE_WIDTH - MARGIN - textWidth(label, "regular", 8), PAGE_HEIGHT - 26, {
        font: "regular",
        size: 8,
        color: MUTED,
      });
    }
  }

  async build(): Promise<Uint8Array> {
    this.drawHeader();
    if (this.report.items.length === 0) {
      this.page.text("No feedback to show.", MARGIN, this.cursor + 10, { font: "regular", size: 10.5, color: MUTED });
    }
    for (const item of this.report.items) {
      this.placeCard(await this.cardRows(item), TYPE_COLOR[item.type]);
      await this.deps.pause?.();
    }
    this.drawFooters();
    return this.doc.finish({ title: `SitePing feedback: ${this.report.title}`, createdAt: this.report.generatedAt });
  }
}

/** The report as the bytes of a PDF file. */
export function buildReportPdf(report: Report, deps: ReportDeps = {}): Promise<Uint8Array> {
  return new ReportBuilder(report, deps).build();
}
