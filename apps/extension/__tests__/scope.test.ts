import { describe, expect, it } from "vitest";
import { deepLinkUrl, isAnnotatable, pageScopeUrl, pageUrl, projectOf, siteLabel } from "../src/shared/scope.js";

const at = (url: string): URL => new URL(url);

describe("isAnnotatable", () => {
  it("accepts http and https pages only", () => {
    expect(isAnnotatable("https://example.com/a")).toBe(true);
    expect(isAnnotatable("http://localhost:3000/")).toBe(true);
    expect(isAnnotatable("chrome://extensions")).toBe(false);
    expect(isAnnotatable("file:///tmp/a.html")).toBe(false);
    expect(isAnnotatable("about:blank")).toBe(false);
    expect(isAnnotatable(undefined)).toBe(false);
  });
});

describe("projectOf", () => {
  it("is the origin, so two ports are two projects", () => {
    expect(projectOf(at("http://localhost:3000/a?b#c"))).toBe("http://localhost:3000");
    expect(projectOf(at("http://localhost:4000/a"))).toBe("http://localhost:4000");
  });
});

describe("pageScopeUrl", () => {
  it("keeps the path and the query that selects the page", () => {
    expect(pageScopeUrl(at("https://example.com/shop/item?id=5&size=m#reviews"))).toBe("/shop/item?id=5&size=m");
    expect(pageScopeUrl(at("https://example.com/"))).toBe("/");
  });

  it("drops the deep-link parameter, so a deep-linked page matches its own feedback", () => {
    expect(pageScopeUrl(at("https://example.com/pricing?siteping=abc"))).toBe("/pricing");
    expect(pageScopeUrl(at("https://example.com/pricing?id=5&siteping=abc"))).toBe("/pricing?id=5");
  });

  it("drops tracking parameters, so the same page reached two ways is one page", () => {
    expect(pageScopeUrl(at("https://example.com/?utm_source=mail&utm_campaign=x&gclid=1&fbclid=2&msclkid=3"))).toBe(
      "/",
    );
    expect(pageScopeUrl(at("https://example.com/?utm=kept"))).toBe("/?utm=kept");
  });
});

describe("pageUrl and deepLinkUrl", () => {
  const record = { id: "f1", projectName: "https://example.com", url: "/pricing?id=5" };

  it("resolve the stored relative URL against the project", () => {
    expect(pageUrl(record)).toBe("https://example.com/pricing?id=5");
    expect(deepLinkUrl(record)).toBe("https://example.com/pricing?id=5&siteping=f1");
  });

  it("refuse a record that does not point at an http page", () => {
    const crafted = { id: "f1", projectName: "https://example.com", url: "javascript:alert(1)" };
    expect(pageUrl(crafted)).toBeNull();
    expect(deepLinkUrl(crafted)).toBeNull();
  });

  it("keeps a path that starts with two slashes on its own site", () => {
    // A valid path, which relative resolution would read as another host.
    const scope = pageScopeUrl(at("https://example.com//other.example/page?id=1"));
    const odd = { id: "f1", projectName: "https://example.com", url: scope };

    expect(scope).toBe("//other.example/page?id=1");
    expect(pageUrl(odd)).toBe("https://example.com//other.example/page?id=1");
    expect(deepLinkUrl(odd)).toBe("https://example.com//other.example/page?id=1&siteping=f1");
  });

  it.each([
    ["an absolute URL", "https://other.example/page"],
    ["a protocol-relative URL without a leading path", "other.example/page"],
    ["credentials in front of another host", "@other.example/page"],
    ["a backslash path", "\\other.example/page"],
    ["nothing", ""],
  ])("refuses %s as a page of the site", (_label, url) => {
    const record = { id: "f1", projectName: "https://example.com", url };
    expect(pageUrl(record)).toBeNull();
    expect(deepLinkUrl(record)).toBeNull();
  });

  it("refuses a record whose site is not an http origin", () => {
    expect(pageUrl({ projectName: "javascript:alert(1)", url: "/a" })).toBeNull();
    expect(pageUrl({ projectName: "not a url", url: "/a" })).toBeNull();
  });

  it("round-trips through pageScopeUrl", () => {
    const link = deepLinkUrl(record);
    expect(link && pageScopeUrl(at(link))).toBe(record.url);
  });
});

describe("siteLabel", () => {
  it("names a site by its host", () => {
    expect(siteLabel("https://example.com")).toBe("example.com");
    expect(siteLabel("http://localhost:3000")).toBe("localhost:3000");
    expect(siteLabel("not a url")).toBe("not a url");
  });
});
