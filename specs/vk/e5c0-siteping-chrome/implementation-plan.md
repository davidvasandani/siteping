# Implementation plan: SitePing browser extension

Task: `vk/e5c0-siteping-chrome`. Builds on `technical-spec.md` and
`prior-knowledge.md` in this directory.

Everything lands in a new private workspace `apps/extension`. No file under
`packages/*` changes. Each step ends with its tests passing.

## 1. Workspace skeleton

- `apps/extension/package.json`: private, `@siteping/extension`, scripts
  `build` (`node build.mjs`), `check` (`tsc --noEmit`), `clean`,
  `safari:xcode`. Dependencies: `@siteping/core` and `@siteping/widget`
  (`workspace:*`). Dev: `esbuild` (already the workspace's bundler),
  `@types/chrome` (types only), `pdfjs-dist` (tests only).
- `tsconfig.json` extending `tsconfig.base.json`, `lib` DOM, covering `src`,
  `__tests__`, `build.mjs` typings as needed.
- `vitest.config.ts` (root): add `apps/*/__tests__/**/*.test.ts` to `include`
  and alias `@siteping/widget` to its source like the other packages.
- `knip.json`: an `apps/extension` entry.

## 2. Shared kernel (`src/shared/`)

- `browser.ts`: the `ExtensionApi` port (storage areas, runtime messaging,
  tabs, scripting, permissions, commands) and `extensionApi()` binding
  `globalThis.browser ?? globalThis.chrome`. A compile-time assignment
  against `@types/chrome` keeps the port honest.
- `scope.ts`: `projectOf(location)` (origin) and `pageScopeUrl(location)`
  (pathname + search minus `siteping`, `utm_*`, `gclid`, `fbclid`),
  `absoluteUrl(record)`.
- `records.ts`: `FEEDBACK_KEY_PREFIX`, `serializeRecord`, `reviveRecord`
  (lenient like the localStorage adapter: an entry that cannot be revived is
  skipped, never deleted), `readAllRecords(area)` sorted newest first.
- `settings.ts`: `Settings`, `readSettings`, `writeSettings`,
  `isSlackWebhookUrl`.
- `messages.ts`: the request union, `{ ok, value } | { ok, error }` replies,
  error encoding that survives JSON (`kind` for the core store errors), and
  `call(api, request)`.

Tests: scope edge cases, revival of dates and of damaged entries, webhook
URL validation, error round trip.

## 3. Background (`src/background/`)

- `store.ts`: `createExtensionStore(area)`: `createCollectionStore` with
  `comments: true`, a per-worker cache, and a `persist` that writes only
  changed `fb:<id>` keys and removes deleted ones; failures become
  `StorePersistenceError`.
- `injection.ts`: `createTabController(api)`: `enable(tabId)`,
  `disable(tabId)`, `isEnabled(tabId)`, `onTabUpdated(tabId, change)`,
  `onTabRemoved(tabId)`, backed by `storage.session`. Refused injection
  disables the tab.
- `index.ts`: wires `runtime.onMessage` (store calls, `capture`, tab
  toggling, stats), `tabs.onUpdated`, `tabs.onRemoved`, `commands.onCommand`.

Tests over fakes: diffed writes, deletes, quota failure with screenshot
retry, cache reload after worker restart, injection decisions, message
dispatch including unknown messages and thrown store errors.

## 4. Content script (`src/content/`)

- `remote-store.ts`: `SitepingStore` over `call()`, reviving records and
  rethrowing the core store errors.
- `screenshot.ts`: `captureAnnotatedScreenshot(rect, options)` with the
  original's signature: geometry (`captureArea`, pure), hide chrome, two
  frames, `capture` request, crop and encode, restore chrome in `finally`;
  falls back to the widget's implementation on failure.
- `index.ts`: guarded controller: `mount()` (reads settings, calls
  `initSiteping` with `store`, `projectName`, `forceShow`, `enableScreenshot`,
  `deepLink`, `theme: "auto"`, browser locale, identity, `getPageScope`),
  `unmount()`, and handlers for `unmount` / `navigated` messages.

Tests (jsdom): geometry clamping, chrome hidden and restored even when the
capture throws, fallback path, controller idempotence, store error mapping.

## 5. PDF (`src/pdf/`)

- `winansi.ts`: Unicode to WinAnsi, `canEncode`, `encodeHex`.
- `metrics.ts`: Helvetica and Helvetica-Bold widths (generated from the Adobe
  AFM files, source noted), `textWidth`, `wrapText`, `truncateToWidth`.
- `jpeg.ts`: `parseJpeg(bytes)` returning width, height, components.
- `writer.ts`: `PdfDocument`: `addPage()`, drawing operators (rect, rounded
  rect, circle, line, text, image, alpha), `addJpeg`, `addRgbImage`, links,
  metadata, `finish()` producing bytes with a correct xref.
- `report.ts`: `buildReport(input, deps)`: summary header, feedback cards,
  page breaks, footers with page numbers. `deps.rasterize` renders a
  paragraph the standard fonts cannot encode; without it such characters
  become `?`.
- `raster.ts`: the browser canvas implementation of `rasterize`, and
  `toJpegDataUrl` for a screenshot that is not JPEG.

Tests: encoding table, wrapping, JPEG parsing (baseline and progressive),
xref offsets, and the finished report parsed by `pdfjs-dist` for page count,
text and image count. During development the PDF is also rendered to PNG and
looked at.

## 6. Slack (`src/slack/`)

- `message.ts`: `buildSlackMessages(report)` (Block Kit, at most 50 blocks
  and 3000 characters per section, split into parts), `escapeMrkdwn`,
  `buildClipboard(report)` returning `{ text, html }`.
- `send.ts`: `sendToSlack(url, payloads, fetch)`, sequential, with
  `SlackSendError` naming how many parts were delivered and Slack's reply.

Tests: limits, splitting, escaping of `<!channel>`, links, error mapping.

## 7. UI (`src/ui/`)

- `popup.html|ts`: site, on/off switch, counts for this site, buttons to the
  review page, clear message on pages where the extension cannot run.
- `review.html|ts`: site filter, status and type filters, feedback cards with
  screenshot and region outline, status change and delete, select all or
  some, Export PDF, Send to Slack, Copy for Slack, settings (name, email,
  webhook). Live refresh on `storage.onChanged`.
- `styles.css`, icons generated at build time from one SVG source is not
  possible without a rasteriser, so PNG icons are committed.

Tests: the pure view-model functions (filtering, counts, selection, file
name). DOM wiring is covered by the e2e.

## 8. Build and packaging

- `build.mjs`: esbuild bundles `background`, `content` (IIFE, widget from
  source, screenshot alias with a must-match guard), `popup`, `review`;
  copies HTML, CSS, icons; writes `manifest.json` for `--target chrome|safari`
  into `dist/<target>/`; `--zip` is left to CI.
- `manifest.json` template with `__VERSION__` from `package.json`.
- `scripts/safari.mjs`: runs `xcrun safari-web-extension-converter` on
  `dist/safari`, macOS only, with a clear error elsewhere.
- Test: build both targets and assert the manifests (permissions, background
  key per target, no host permission in the shipped manifest).

## 9. End to end

- `e2e/extension.spec.ts` (Chromium project only): copy `dist/chrome`, add
  `<all_urls>` to the copy's manifest, launch a persistent context with it,
  open the fixture page, switch on through `popup.html?tabId=`, annotate,
  assert marker, stored screenshot, review page listing, PDF download
  (`%PDF`, parsed page count), Slack post against a routed stand-in, and
  clipboard copy.
- Local runs take the browser from `SITEPING_CHROMIUM` (NixOS).

## 10. CI

- `.github/workflows/extension.yml`: on pull requests touching the extension,
  widget or core, and on `main`: build both targets on Linux and upload the
  Chrome zip; on macOS run the converter and an unsigned `xcodebuild`, upload
  the app. Pinned actions, `permissions: contents: read`, passes
  `actionlint`/`zizmor` like the other workflows.

## 11. Documentation

- `apps/extension/README.md`: install (Chrome unpacked, Safari via Xcode),
  use, exports, permissions and privacy, what is verified on Safari.
- Root `README.md`: a short section linking to it. `CLAUDE.md`: architecture
  bullet and commands.

## 12. Gates

`bun run verify`, `bun run check:consistency`, `bun run knip`, the extension
e2e, then the Codex review, the wiki pages, and the pull request.

## Order and parallelism

1 → 2 → {3, 4, 5, 6} → 7 → 8 → 9 → {10, 11} → 12. Steps 3 to 6 touch
disjoint directories.
