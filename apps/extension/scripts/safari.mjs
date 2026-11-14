import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Wrap the Safari build in the app Safari requires: a web extension only
 * installs as part of a macOS app. Apple's converter generates the Xcode
 * project from `dist/safari`; opening it in Xcode and running it installs
 * the extension (Safari, Settings, Extensions).
 *
 * macOS with Xcode only. The identifier defaults to a placeholder: set
 * SITEPING_BUNDLE_ID to your own before distributing.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const source = join(root, "dist", "safari");
const project = join(root, "dist", "safari-xcode");
const bundleId = process.env.SITEPING_BUNDLE_ID ?? "dev.siteping.extension";

if (process.platform !== "darwin") {
  console.error("Packaging for Safari needs macOS with Xcode (xcrun safari-web-extension-converter).");
  process.exit(1);
}
if (!existsSync(join(source, "manifest.json"))) {
  console.error("dist/safari is missing. Run `bun run build` in apps/extension first.");
  process.exit(1);
}

const result = spawnSync(
  "xcrun",
  [
    "safari-web-extension-converter",
    source,
    "--project-location",
    project,
    "--app-name",
    "SitePing",
    "--bundle-identifier",
    bundleId,
    "--macos-only",
    "--swift",
    "--copy-resources",
    "--no-open",
    "--no-prompt",
    "--force",
  ],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`\nXcode project: ${join(project, "SitePing", "SitePing.xcodeproj")}`);
