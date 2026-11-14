import { describe, expect, it } from "vitest";
import { countItems, plural, toReport } from "../src/shared/report.js";
import { createRecord, TINY_JPEG_DATA_URL } from "./fixtures.js";

const at = new Date("2026-11-14T15:00:00Z");

describe("toReport", () => {
  it("numbers items in the order given and names the single site", () => {
    const report = toReport([createRecord({ url: "/a" }), createRecord({ url: "/b?id=1" })], at);

    expect(report.title).toBe("example.com");
    expect(report.siteCount).toBe(1);
    expect(report.generatedAt).toBe(at);
    expect(report.items.map((item) => [item.number, item.pageLabel, item.pageUrl])).toEqual([
      [1, "/a", "https://example.com/a"],
      [2, "/b?id=1", "https://example.com/b?id=1"],
    ]);
  });

  it("names several sites as such and puts the host in front of each page", () => {
    const report = toReport(
      [
        createRecord({ projectName: "https://a.example", url: "/x" }),
        createRecord({ projectName: "http://localhost:3000", url: "/" }),
      ],
      at,
    );

    expect(report.title).toBe("All sites");
    expect(report.siteCount).toBe(2);
    expect(report.items.map((item) => item.pageLabel)).toEqual(["a.example/x", "localhost:3000/"]);
  });

  it("carries the author, viewport, thread and screenshot", () => {
    const record = createRecord({
      authorName: "Ada",
      viewport: "1280x720",
      screenshotDataUrl: TINY_JPEG_DATA_URL,
      screenshotRegion: { xPct: 0.1, yPct: 0.2, wPct: 0.3, hPct: 0.4 },
    });
    record.comments = [
      {
        id: "c1",
        feedbackId: record.id,
        body: "On it",
        authorName: "Bo",
        authorEmail: "bo@example.com",
        authorRole: "client",
        clientId: "c1",
        createdAt: at,
      },
    ];

    const [item] = toReport([record], at).items;

    expect(item).toMatchObject({
      author: "Ada",
      viewport: "1280×720",
      comments: [{ author: "Bo", body: "On it", createdAt: at }],
      screenshot: { dataUrl: TINY_JPEG_DATA_URL, region: { xPct: 0.1, yPct: 0.2, wPct: 0.3, hPct: 0.4 } },
    });
  });

  it("leaves out a screenshot that is not an inline image, and a page that is not http", () => {
    const remote = createRecord({ screenshotDataUrl: "https://tracker.example/pixel.png" });
    const svg = createRecord({ screenshotDataUrl: "data:image/svg+xml;base64,AAAA" });
    const crafted = createRecord({ url: "javascript:alert(1)" });

    const report = toReport([remote, svg, crafted], at);

    expect(report.items.map((item) => item.screenshot)).toEqual([null, null, null]);
    expect(report.items[2]?.pageUrl).toBeNull();
  });

  it("describes an empty selection", () => {
    expect(toReport([], at)).toMatchObject({ title: "All sites", siteCount: 0, items: [] });
  });
});

describe("countItems", () => {
  it("counts by status and by type, zero included", () => {
    const items = toReport(
      [
        createRecord({ type: "bug" }),
        createRecord({ type: "bug", status: "resolved" }),
        createRecord({ type: "question" }),
      ],
      at,
    ).items;

    expect(countItems(items)).toEqual({
      status: { open: 2, in_progress: 0, resolved: 1, wont_fix: 0 },
      type: { question: 1, change: 0, bug: 2, other: 0 },
    });
  });
});

describe("plural", () => {
  it("agrees with the count", () => {
    expect(plural(1, "item")).toBe("1 item");
    expect(plural(0, "item")).toBe("0 items");
    expect(plural(3, "site")).toBe("3 sites");
  });
});
