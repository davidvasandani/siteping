import { join, sep } from "node:path";

/**
 * The seam into the widget: its annotator imports `./screenshot.js`, and the
 * extension answers that import with its own module, which captures the tab
 * instead of re-rendering the DOM (see `src/content/screenshot.ts`).
 *
 * It reaches into a file of another package, so it counts its matches: if
 * the widget renames or restructures that import, `assertSeamUsed` fails the
 * build instead of letting it silently ship the DOM renderer again.
 */
export function screenshotSeam({ widgetSource, replacement }) {
  const inWidget = widgetSource.endsWith(sep) ? widgetSource : widgetSource + sep;
  const seam = {
    matches: 0,
    plugin: {
      name: "siteping-screenshot-seam",
      setup(esbuild) {
        esbuild.onResolve({ filter: /^\.\/screenshot\.js$/ }, (args) => {
          // The replacement itself falls back to the original, which it
          // imports from outside the widget's folder: left alone.
          if (!args.importer.startsWith(inWidget)) return undefined;
          seam.matches += 1;
          return { path: replacement };
        });
      },
    },
  };
  return seam;
}

export function assertSeamUsed(seam) {
  if (seam.matches > 0) return;
  throw new Error(
    `The widget no longer imports ./screenshot.js: the extension's tab capture was not bundled. Update ${join("apps", "extension", "scripts", "seam.mjs")} and src/content/screenshot.ts to the widget's new layout.`,
  );
}
