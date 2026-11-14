import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { ICON_SIZES, renderIcon } from "./icons.mjs";
import { assertSeamUsed, screenshotSeam } from "./seam.mjs";

/**
 * Build the extension: `dist/chrome` and `dist/safari`, each a folder the
 * browser loads as it is (Chrome: "Load unpacked"; Safari: the input of
 * `scripts/safari.mjs`).
 *
 *   node scripts/build.mjs [--target chrome|safari] [--outdir <dir>]
 *
 * The two targets differ only in how the manifest declares the background:
 * Chrome runs it as a service worker, Safari as a non-persistent page.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const repo = join(root, "..", "..");

const TARGETS = {
  chrome: { background: { service_worker: "background.js" }, minimum_chrome_version: "116" },
  safari: { background: { scripts: ["background.js"], persistent: false } },
};

const option = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);

async function bundle(outdir) {
  const shared = {
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    minify: true,
    logLevel: "warning",
  };
  const seam = screenshotSeam({
    widgetSource: join(repo, "packages", "widget", "src"),
    replacement: join(root, "src", "content", "screenshot.ts"),
  });

  await Promise.all([
    build({ ...shared, entryPoints: { background: join(root, "src/background/index.ts") }, outdir }),
    build({
      ...shared,
      entryPoints: { content: join(root, "src/content/index.ts") },
      outdir,
      // The widget from its source, not its published build: the seam needs
      // its modules, and a content script cannot load the build's separate
      // chunks.
      alias: { "@siteping/widget": join(repo, "packages/widget/src/index.ts") },
      plugins: [seam.plugin],
    }),
    build({
      ...shared,
      entryPoints: { popup: join(root, "src/ui/popup.ts"), review: join(root, "src/ui/review.ts") },
      outdir,
    }),
  ]);
  assertSeamUsed(seam);
}

async function buildTarget(target, outdir, version, manifest) {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(join(outdir, "icons"), { recursive: true });

  await bundle(outdir);
  await Promise.all([
    ...["popup.html", "review.html", "styles.css"].map((file) => cp(join(root, "src/ui", file), join(outdir, file))),
    ...ICON_SIZES.map((size) => writeFile(join(outdir, "icons", `icon-${size}.png`), renderIcon(size))),
    writeFile(
      join(outdir, "manifest.json"),
      `${JSON.stringify({ ...manifest, version, ...TARGETS[target] }, null, 2)}\n`,
    ),
  ]);
  console.log(`built ${target} ${version} in ${outdir}`);
}

const requested = option("--target");
if (requested !== undefined && !Object.hasOwn(TARGETS, requested)) {
  console.error(`Unknown target "${requested}". Use one of: ${Object.keys(TARGETS).join(", ")}.`);
  process.exit(1);
}
const dist = option("--outdir") ?? join(root, "dist");

const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(root, "src/manifest.json"), "utf8"));
for (const target of requested ? [requested] : Object.keys(TARGETS)) {
  await buildTarget(target, join(dist, target), version, manifest);
}
