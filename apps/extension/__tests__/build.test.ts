import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ICON_SIZES, renderIcon } from "../scripts/icons.mjs";
import { assertSeamUsed, screenshotSeam } from "../scripts/seam.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version as string;

let out: string;
const manifestOf = (target: string) => JSON.parse(readFileSync(join(out, target, "manifest.json"), "utf8"));

beforeAll(() => {
  out = mkdtempSync(join(tmpdir(), "siteping-extension-build-"));
  execFileSync(process.execPath, [join(root, "scripts/build.mjs"), "--outdir", out], { stdio: "pipe" });
}, 120_000);

afterAll(() => rmSync(out, { recursive: true, force: true }));

describe("the shipped manifest", () => {
  it.each(["chrome", "safari"])("%s asks for no website access at install", (target) => {
    const manifest = manifestOf(target);

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe(version);
    expect(manifest.permissions).toEqual(["activeTab", "scripting", "storage", "unlimitedStorage"]);
    // The one host the extension can ever reach, and only once the reviewer grants it.
    expect(manifest.optional_host_permissions).toEqual(["https://hooks.slack.com/*"]);
    for (const key of [
      "host_permissions",
      "content_scripts",
      "web_accessible_resources",
      "externally_connectable",
      "optional_permissions",
    ]) {
      expect(manifest, key).not.toHaveProperty(key);
    }
    expect(JSON.stringify(manifest)).not.toContain("<all_urls>");
  });

  it("declares the background the way each browser runs it", () => {
    expect(manifestOf("chrome").background).toEqual({ service_worker: "background.js" });
    expect(manifestOf("chrome").minimum_chrome_version).toBe("116");
    expect(manifestOf("safari").background).toEqual({ scripts: ["background.js"] });
    expect(manifestOf("safari")).not.toHaveProperty("minimum_chrome_version");
  });

  it("declares the shortcut the background listens for", () => {
    expect(Object.keys(manifestOf("chrome").commands)).toEqual(["toggle-siteping"]);
    expect(readFileSync(join(root, "src/background/index.ts"), "utf8")).toContain('"toggle-siteping"');
  });
});

describe("the built folder", () => {
  it.each(["chrome", "safari"])("%s holds every file the manifest and pages refer to", (target) => {
    const dir = join(out, target);
    const manifest = manifestOf(target);
    const referenced = [
      manifest.action.default_popup,
      ...Object.values<string>(manifest.action.default_icon),
      ...Object.values<string>(manifest.icons),
      manifest.background.service_worker ?? manifest.background.scripts[0],
      "content.js",
      "review.html",
    ];
    for (const page of ["popup.html", "review.html"]) {
      const html = readFileSync(join(dir, page), "utf8");
      referenced.push(...[...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((match) => match[1] as string));
      // The default extension CSP forbids inline scripts.
      expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/);
    }
    for (const file of referenced) expect(existsSync(join(dir, file)), file).toBe(true);
  });

  it("bundles the tab capture into the content script, with the widget", () => {
    const content = readFileSync(join(out, "chrome", "content.js"), "utf8");
    expect(content).toContain("Tab capture failed");
    expect(content).toContain("siteping-widget");
    // One self-contained script: a content script cannot import chunks.
    expect(content).not.toMatch(/\bimport\s*\(\s*["']\.\//);
  });

  it("keeps the background free of the widget and of page-only code", () => {
    const background = readFileSync(join(out, "chrome", "background.js"), "utf8");
    expect(background).not.toContain("html2canvas");
    expect(background.length).toBeLessThan(50_000);
  });
});

describe("the screenshot seam", () => {
  const widgetSource = "/repo/packages/widget/src";
  const replacement = "/repo/apps/extension/src/content/screenshot.ts";
  type Resolver = (args: { importer: string }) => { path: string } | undefined;
  const resolverOf = (seam: ReturnType<typeof screenshotSeam>): Resolver => {
    let resolver: Resolver | undefined;
    seam.plugin.setup({
      onResolve: (_options: unknown, callback: Resolver) => {
        resolver = callback;
      },
    });
    return resolver as Resolver;
  };

  it("answers the widget's import with the extension's module", () => {
    const seam = screenshotSeam({ widgetSource, replacement });
    expect(resolverOf(seam)({ importer: `${widgetSource}/annotator.ts` })).toEqual({ path: replacement });
    expect(seam.matches).toBe(1);
    expect(() => assertSeamUsed(seam)).not.toThrow();
  });

  it("leaves the same import from anywhere else alone", () => {
    const seam = screenshotSeam({ widgetSource, replacement });
    const resolve = resolverOf(seam);
    expect(resolve({ importer: replacement })).toBeUndefined();
    expect(resolve({ importer: "/repo/packages/widget/src-other/annotator.ts" })).toBeUndefined();
    expect(seam.matches).toBe(0);
  });

  it("fails the build when the widget no longer has that import", () => {
    expect(() => assertSeamUsed(screenshotSeam({ widgetSource, replacement }))).toThrow(
      /no longer imports \.\/screenshot\.js/,
    );
  });
});

describe("renderIcon", () => {
  it.each(ICON_SIZES)("draws a %ipx PNG", (size) => {
    const png = renderIcon(size);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  });

  it("is the same every time", () => {
    expect(renderIcon(48).equals(renderIcon(48))).toBe(true);
  });
});
