import { describe, expect, it } from "vitest";
import { decodeDataUrl, parseJpeg } from "../src/pdf/jpeg.js";
import { PdfDocument } from "../src/pdf/writer.js";
import { TINY_JPEG_DATA_URL } from "./fixtures.js";
import { readPdf } from "./pdf-reader.js";

const latin1 = (bytes: Uint8Array): string => new TextDecoder("latin1").decode(bytes);
const meta = { title: "Test", createdAt: new Date("2026-11-14T15:00:00Z") };

describe("PdfDocument", () => {
  it("writes a file whose cross-reference table points at every object", async () => {
    const doc = new PdfDocument();
    const page = doc.addPage(200, 100);
    page.text("Hello", 10, 20, { font: "regular", size: 12, color: "#000000" });
    page.link({ x: 10, y: 10, width: 50, height: 12 }, "https://example.com/");
    const file = latin1(await doc.finish(meta));

    expect(file.startsWith("%PDF-1.4\n")).toBe(true);
    expect(file.trimEnd().endsWith("%%EOF")).toBe(true);

    const xref = Number(/startxref\n(\d+)\n%%EOF/.exec(file)?.[1]);
    expect(file.slice(xref, xref + 4)).toBe("xref");
    const [, count] = /xref\n0 (\d+)\n/.exec(file.slice(xref)) ?? [];
    const entries = file
      .slice(xref)
      .split("\n")
      .slice(2, 2 + Number(count));
    expect(entries[0]).toBe("0000000000 65535 f ");
    for (const [id, entry] of entries.entries()) {
      // Each entry is 20 bytes with its line end, as readers that seek by arithmetic expect.
      expect(entry).toHaveLength(19);
      if (id > 0) expect(file.slice(Number(entry.slice(0, 10)))).toMatch(new RegExp(`^${id} 0 obj\\n`));
    }
  });

  it("is read back by an independent reader: text, link, metadata, page size", async () => {
    const doc = new PdfDocument();
    const page = doc.addPage(300, 200);
    page.rect({ x: 0, y: 0, width: 300, height: 40 }, { fill: "#0066ff" });
    page.rect({ x: 10, y: 50, width: 100, height: 30 }, { stroke: "#e2e8f0", fill: "#ffffff", radius: 6 });
    page.rect({ x: 10, y: 90, width: 100, height: 30 }, { fill: "#d01f1f", opacity: 0.12 });
    page.circle(20, 140, 8, "#0f172a");
    page.text("Déjà vu — 49 €", 10, 30, { font: "bold", size: 14, color: "#ffffff", opacity: 0.8 });
    page.link({ x: 10, y: 150, width: 80, height: 12 }, "https://example.com/a(b)?q=1");
    doc.addPage(300, 200).text("Second page", 10, 30, { font: "regular", size: 10, color: "#000000" });

    const read = await readPdf(await doc.finish({ ...meta, title: "Retours — façade" }));

    expect(read.title).toBe("Retours — façade");
    expect(read.pages).toHaveLength(2);
    expect(read.pages[0]?.text).toEqual(["Déjà vu — 49 €"]);
    expect(read.pages[0]?.links).toEqual(["https://example.com/a(b)?q=1"]);
    expect(read.pages[1]?.text).toEqual(["Second page"]);
  });

  it("embeds a JPEG as it is and raw pixels compressed", async () => {
    const doc = new PdfDocument();
    const page = doc.addPage(200, 200);
    const bytes = decodeDataUrl(TINY_JPEG_DATA_URL)?.bytes as Uint8Array;
    const jpeg = doc.addJpeg(bytes, parseJpeg(bytes) as NonNullable<ReturnType<typeof parseJpeg>>);
    const pixels = doc.addRgb(new Uint8Array(4 * 2 * 3).fill(200), 4, 2);
    page.image(jpeg, { x: 10, y: 10, width: 50, height: 50 }, 6);
    page.image(pixels, { x: 10, y: 70, width: 40, height: 20 });

    const file = await doc.finish(meta);
    const text = latin1(file);

    expect(text).toContain("/Filter /DCTDecode");
    expect(text).toContain("/Width 4 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode");
    expect((await readPdf(file)).pages[0]?.images).toBe(2);
  });

  it("refuses pixel data that does not match its size", () => {
    expect(() => new PdfDocument().addRgb(new Uint8Array(5), 2, 2)).toThrow(/does not match/);
  });

  it("writes a character outside the fonts' encoding as a question mark", async () => {
    const doc = new PdfDocument();
    doc.addPage(200, 100).text("ok → ?", 10, 20, { font: "regular", size: 10, color: "#000000" });

    expect((await readPdf(await doc.finish(meta))).pages[0]?.text).toEqual(["ok ? ?"]);
  });
});
