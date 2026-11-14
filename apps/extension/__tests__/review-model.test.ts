import { describe, expect, it } from "vitest";
import {
  ALL,
  applyFilters,
  chosen,
  exportFileName,
  NO_FILTERS,
  reconcileFilters,
  sitesOf,
  summarize,
} from "../src/ui/review-model.js";
import { createRecord } from "./fixtures.js";

const records = [
  createRecord({ projectName: "https://b.example", type: "bug" }),
  createRecord({ projectName: "https://a.example", type: "question", status: "resolved" }),
  createRecord({ projectName: "https://b.example", type: "change", status: "in_progress" }),
];

describe("sitesOf", () => {
  it("lists each site once, by name, with its count", () => {
    expect(sitesOf(records)).toEqual([
      { projectName: "https://a.example", label: "a.example", count: 1 },
      { projectName: "https://b.example", label: "b.example", count: 2 },
    ]);
  });
});

describe("applyFilters", () => {
  it("shows everything without filters", () => {
    expect(applyFilters(records, NO_FILTERS)).toEqual(records);
  });

  it("narrows by site, status and type together", () => {
    expect(applyFilters(records, { ...NO_FILTERS, site: "https://b.example" })).toHaveLength(2);
    expect(applyFilters(records, { ...NO_FILTERS, status: "resolved" })).toEqual([records[1]]);
    expect(applyFilters(records, { site: "https://b.example", status: "in_progress", type: "change" })).toEqual([
      records[2],
    ]);
    expect(applyFilters(records, { site: "https://a.example", status: ALL, type: "bug" })).toEqual([]);
  });
});

describe("reconcileFilters", () => {
  it("keeps a site filter that still has feedback", () => {
    const filters = { ...NO_FILTERS, site: "https://a.example" };
    expect(reconcileFilters(filters, records)).toBe(filters);
  });

  it("falls back to every site when the filtered one has none left", () => {
    expect(reconcileFilters({ ...NO_FILTERS, site: "https://gone.example", type: "bug" }, records)).toEqual({
      ...NO_FILTERS,
      type: "bug",
    });
  });
});

describe("chosen and summarize", () => {
  it("exports what is shown minus what was unticked", () => {
    const excluded = new Set([records[0]?.id as string, "not-shown"]);
    expect(chosen(records, excluded)).toEqual([records[1], records[2]]);
  });

  it("summarises the list", () => {
    expect(summarize(records, records)).toBe("3 shown · 2 open");
    expect(summarize(records, [records[1] as (typeof records)[number]])).toBe("3 shown · 1 selected · 2 open");
    expect(summarize([], [])).toBe("Nothing to show");
  });
});

describe("exportFileName", () => {
  const generatedAt = new Date(2026, 10, 4, 9, 30);

  it("names the file after the site and the day", () => {
    expect(exportFileName({ title: "example.com", generatedAt })).toBe("siteping-example.com-2026-11-04.pdf");
    expect(exportFileName({ title: "localhost:3000", generatedAt })).toBe("siteping-localhost-3000-2026-11-04.pdf");
    expect(exportFileName({ title: "All sites", generatedAt })).toBe("siteping-all-sites-2026-11-04.pdf");
  });

  it("never yields a name a file system refuses", () => {
    expect(exportFileName({ title: "../../etc/passwd", generatedAt })).toBe("siteping-etc-passwd-2026-11-04.pdf");
    expect(exportFileName({ title: "???", generatedAt })).toBe("siteping-feedback-2026-11-04.pdf");
  });
});
