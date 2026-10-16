// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { annotationDestination } from "../../src/annotation-navigation.js";

describe("annotation destinations", () => {
  it("preserves the destination query and fragment and replaces the focus id", () => {
    const target = new URL(annotationDestination("/talent/person?q=a&siteping=old#details", "fb &1", "siteping")!);
    expect(target.pathname).toBe("/talent/person");
    expect(target.searchParams.get("q")).toBe("a");
    expect(target.searchParams.getAll("siteping")).toEqual(["fb &1"]);
    expect(target.hash).toBe("#details");
    expect(target.origin).toBe(window.location.origin);
  });

  it("supports absolute same-origin URLs and custom parameters", () => {
    expect(annotationDestination(`${window.location.origin}/talent/1`, "fb-1", "feedback")).toBe(
      `${window.location.origin}/talent/1?feedback=fb-1`,
    );
  });

  it("does not navigate when deep links are disabled", () => {
    expect(annotationDestination("/talent/1", "fb-1", undefined)).toBeNull();
  });

  it.each([
    "",
    "  ",
    "https://evil.example/path",
    "//evil.example",
    "javascript:alert(1)",
    "data:text/html,test",
    "http://[",
    "http://user:pass@localhost/",
  ])("rejects unsafe or invalid destination %s", (url) =>
    expect(annotationDestination(url, "fb-1", "siteping")).toBeNull(),
  );
});
