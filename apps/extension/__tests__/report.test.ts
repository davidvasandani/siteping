import { describe, expect, it } from "vitest";
import { buildReportPdf, type RasterRequest } from "../src/pdf/report.js";
import { toReport } from "../src/shared/report.js";
import { createRecord, TINY_JPEG_DATA_URL } from "./fixtures.js";
import { readPdf } from "./pdf-reader.js";

const at = new Date("2026-11-14T15:00:00Z");
const region = { xPct: 0.25, yPct: 0.25, wPct: 0.5, hPct: 0.5 };
const allText = (pages: { text: string[] }[]): string => pages.flatMap((page) => page.text).join("\n");

describe("buildReportPdf", () => {
  it("opens with the site, the date and the totals", async () => {
    const records = [
      createRecord({ type: "bug", message: "Button overlaps the table" }),
      createRecord({ type: "bug", status: "resolved", message: "Typo in the footer" }),
      createRecord({ type: "question", message: "Is this final?" }),
    ];

    const read = await readPdf(await buildReportPdf(toReport(records, at)));
    const first = read.pages[0]?.text ?? [];

    expect(read.title).toBe("SitePing feedback: example.com");
    expect(first).toContain("example.com");
    expect(first).toContain("Exported 14 Nov 2026 · 3 items");
    // Tiles: value then label, in order.
    const tiles = ["Total", "Open", "In progress", "Resolved", "Won't fix"].map(
      (label) => first[first.indexOf(label) - 1],
    );
    expect(tiles).toEqual(["3", "2", "0", "1", "0"]);
    expect(first).toEqual(expect.arrayContaining(["Question 1", "Change 0", "Bug 2", "Other 0"]));
  });

  it("shows each feedback with its number, type, status, message, page, author and date", async () => {
    const record = createRecord({
      type: "change",
      message: "Shorten the headline.\nIt wraps on mobile.",
      url: "/pricing?id=5",
      authorName: "Chloé Lefèvre",
      viewport: "390x844",
    });

    const read = await readPdf(await buildReportPdf(toReport([record], at)));
    const text = read.pages[0]?.text ?? [];

    expect(text).toEqual(
      expect.arrayContaining([
        "1",
        "Change",
        "Open",
        "14 Nov 2026",
        "Shorten the headline.",
        "It wraps on mobile.",
        "/pricing?id=5",
        "Chloé Lefèvre · 390×844",
      ]),
    );
    expect(read.pages[0]?.links).toEqual(["https://example.com/pricing?id=5"]);
  });

  it("embeds the screenshot and shows the thread", async () => {
    const record = createRecord({ screenshotDataUrl: TINY_JPEG_DATA_URL, screenshotRegion: region });
    record.comments = [
      {
        id: "c1",
        feedbackId: record.id,
        body: "Fixed in the next deploy.",
        authorName: "Bo",
        authorEmail: "",
        authorRole: "client",
        clientId: "c1",
        createdAt: new Date("2026-11-15T09:00:00Z"),
      },
    ];

    const read = await readPdf(await buildReportPdf(toReport([record], at)));

    expect(read.pages[0]?.images).toBe(1);
    expect(read.pages[0]?.text).toEqual(expect.arrayContaining(["Bo · 15 Nov 2026", "Fixed in the next deploy."]));
  });

  it("numbers every page and keeps a feedback on one page when it fits one", async () => {
    const records = Array.from({ length: 14 }, (_, index) =>
      createRecord({ message: `Item ${index + 1}: ${"words ".repeat(40)}` }),
    );

    const read = await readPdf(await buildReportPdf(toReport(records, at)));

    expect(read.pages.length).toBeGreaterThan(1);
    for (const [index, page] of read.pages.entries()) {
      expect(page.text).toContain(`Page ${index + 1} of ${read.pages.length}`);
      expect(page.text).toContain("SitePing · example.com");
    }
    // Every item's first line is on the same page as its number badge.
    for (let number = 1; number <= 14; number++) {
      const page = read.pages.find((candidate) => candidate.text.some((line) => line.startsWith(`Item ${number}:`)));
      expect(page?.text, `item ${number}`).toContain(String(number));
    }
  });

  it("continues a feedback that is taller than a page, losing nothing", async () => {
    const message = Array.from({ length: 130 }, (_, index) => `Line ${index + 1} of a very long report.`).join("\n");

    const read = await readPdf(await buildReportPdf(toReport([createRecord({ message })], at)));

    expect(read.pages.length).toBeGreaterThanOrEqual(3);
    const text = allText(read.pages);
    for (let line = 1; line <= 130; line++) expect(text).toContain(`Line ${line} of a very long report.`);
  });

  it("draws a paragraph the standard fonts cannot write as an image, and keeps the rest as text", async () => {
    const requests: RasterRequest[] = [];
    const rasterize = (request: RasterRequest) => {
      requests.push(request);
      return [
        { width: 120, height: request.lineHeight, pixelWidth: 4, pixelHeight: 2, rgb: new Uint8Array(4 * 2 * 3) },
      ];
    };
    const record = createRecord({ message: "Latin paragraph stays text.\nこのボタンが動きません 🙂" });

    const read = await readPdf(await buildReportPdf(toReport([record], at), { rasterize }));

    expect(requests.map((request) => request.text)).toEqual(["このボタンが動きません 🙂"]);
    expect(requests[0]).toMatchObject({ fontSize: 10.5, bold: false, background: "#ffffff" });
    expect(read.pages[0]?.images).toBe(1);
    expect(read.pages[0]?.text).toContain("Latin paragraph stays text.");
    expect(allText(read.pages)).not.toContain("?");
  });

  it("draws an author's name the fonts cannot write as an image too", async () => {
    const texts: string[] = [];
    const rasterize = (request: RasterRequest) => {
      texts.push(request.text);
      return [{ width: 60, height: request.lineHeight, pixelWidth: 2, pixelHeight: 2, rgb: new Uint8Array(12) }];
    };

    await buildReportPdf(toReport([createRecord({ authorName: "Łukasz" })], at), { rasterize });

    expect(texts).toEqual(["Łukasz  ·  1280×720"]);
  });

  it("without a rasteriser, still produces the report", async () => {
    const read = await readPdf(await buildReportPdf(toReport([createRecord({ message: "Привет" })], at)));
    expect(read.pages[0]?.text).toContain("??????");
  });

  it("re-encodes a screenshot that is not a JPEG, and leaves it out when that fails", async () => {
    const png = createRecord({ screenshotDataUrl: "data:image/png;base64,iVBORw0KGgo=" });
    const jpegBytes = Uint8Array.from(atob(TINY_JPEG_DATA_URL.split(",")[1] as string), (char) => char.charCodeAt(0));

    const converted = await readPdf(await buildReportPdf(toReport([png], at), { toJpeg: async () => jpegBytes }));
    const dropped = await readPdf(await buildReportPdf(toReport([png], at), { toJpeg: async () => null }));
    const noConverter = await readPdf(await buildReportPdf(toReport([png], at)));

    expect(converted.pages[0]?.images).toBe(1);
    expect(dropped.pages[0]?.images).toBe(0);
    expect(noConverter.pages[0]?.images).toBe(0);
  });

  it("links nothing for a feedback without a safe address", async () => {
    const read = await readPdf(await buildReportPdf(toReport([createRecord({ url: "javascript:alert(1)" })], at)));
    expect(read.pages[0]?.links).toEqual([]);
  });

  it("says so when there is nothing to show", async () => {
    const read = await readPdf(await buildReportPdf(toReport([], at)));
    expect(read.pages).toHaveLength(1);
    expect(read.pages[0]?.text).toContain("No feedback to show.");
  });

  it("exports 200 feedback with screenshots within the time budget, pausing between items", async () => {
    const records = Array.from({ length: 200 }, (_, index) =>
      createRecord({
        message: `Feedback ${index + 1}. ${"Some detail about the problem. ".repeat(4)}`,
        screenshotDataUrl: TINY_JPEG_DATA_URL,
        screenshotRegion: region,
      }),
    );
    let pauses = 0;

    const started = performance.now();
    const pdf = await buildReportPdf(toReport(records, at), {
      pause: async () => {
        pauses += 1;
      },
    });
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(10_000);
    expect(pauses).toBe(200);
    const read = await readPdf(pdf);
    expect(read.pages.reduce((sum, page) => sum + page.images, 0)).toBe(200);
  }, 30_000);
});
