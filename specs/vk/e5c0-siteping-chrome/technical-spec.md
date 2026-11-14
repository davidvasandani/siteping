# Technical spec: SitePing as an independent Chrome and Safari extension

Task: `vk/e5c0-siteping-chrome` (workspace `e5c0a8e4-e8e8-40bc-932e-6e0ad13ed9ca`).

## Problem

SitePing today only works on a site whose developer embedded the widget and,
outside the demo adapters, runs a server for it. The task is a browser
extension that brings the same annotation experience to any page, with no
embed and no server: everything stays on the reviewer's machine, and a review
leaves it only through two explicit exports, a PDF file and a Slack message.

## Scope

In scope:

- A WebExtension (Manifest V3) in a new private workspace `apps/extension`,
  built for Chrome and for Safari from one source tree.
- Annotating any `http(s)` page with the existing widget, stored locally.
- A review page inside the extension listing the stored feedback by site.
- Export to a PDF file generated in the browser.
- Export to Slack: post through an Incoming Webhook the user configures, or
  copy a ready-to-paste Slack message.
- CI that builds both targets and proves the Safari target converts and
  compiles with Xcode.

Out of scope: publishing to the Chrome Web Store or the App Store (both need
the owner's developer accounts and signing identities), Firefox, iOS Safari
packaging, syncing between devices, any hosted backend, changes to the
published `@siteping/*` packages' public APIs.

## Constraints found in the repository

- This fork tracks upstream `NeosiaNexus/SitePing` by merging its `main`.
  Edits to `packages/widget` or `packages/core` conflict on every sync, so the
  extension must be additive: a new `apps/extension`, no source change in the
  published packages.
- The widget already has a store mode (`SitepingStoreConfig`,
  `packages/widget/src/store-client.ts`) and core ships the snapshot engine
  `createCollectionStore` (`packages/core/src/store-helpers.ts`), which accepts
  async `load`/`persist`. Its mutation queue is per instance and per JS realm.
- The widget hides itself on public pages unless `forceShow: true`
  (`packages/widget/src/launcher.ts`).
- Screenshots come from `html2canvas-pro` (`packages/widget/src/screenshot.ts`):
  a re-render of the DOM that returns `null` whenever the canvas is tainted,
  which cross-origin images without CORS headers do. On arbitrary sites that
  is the common case.
- `@siteping/core` is an internal package exporting raw TypeScript; apps
  bundle it. Vitest only collects `packages/**/__tests__`; coverage thresholds
  apply to `packages/*/src`.
- `check:consistency` and release-please only know `packages/*`, so a private
  app needs no registration.

## Architecture

```
tab (any http/https page)                 extension origin
┌──────────────────────────────┐         ┌───────────────────────────────────┐
│ content script (isolated)    │ runtime │ background service worker         │
│  widget, bundled from source │ ──────▶ │  the only writer of the store     │
│  RemoteStore (SitepingStore) │ message │  createCollectionStore over       │
│  viewport capture + crop     │ ◀────── │  storage.local, one key/feedback  │
└──────────────────────────────┘         │  tabs.captureVisibleTab           │
                                         │  injects on action / navigation   │
popup.html ─ toggle, counts, shortcuts   └───────────────────────────────────┘
review.html ─ list, filters, PDF export, Slack export, settings
```

### One writer

The background worker owns the single `createCollectionStore` instance. Every
other context (content scripts in any number of tabs, popup, review page)
reaches it through `runtime.sendMessage`. That turns the engine's per-realm
queue into a global one: two tabs submitting at once cannot overwrite each
other's snapshot. Messages are JSON, so `Date`s cross as ISO strings and are
revived on the caller's side.

### Storage layout

`storage.local`, with `unlimitedStorage`:

- `fb:<id>` — one serialized feedback record, screenshot inline as its JPEG
  data URL. `persist` diffs the new snapshot against the loaded one by record
  identity (the engine never mutates a loaded record), writes only changed
  keys and removes deleted ones, so a mutation costs one record, not the
  whole review.
- `settings` — Slack webhook URL, reviewer name and email.
- `storage.session` `tabs` — tab ids with the widget switched on.

The review page reads `fb:*` straight from `storage.local` (a read cannot
race, and a whole review with its screenshots would not fit one runtime
message); every write still goes through the background.

Project identity is the page origin (`https://example.com`), so one site is one
project and `deleteAllFeedbacks` stays scoped to it. Page scope is
`pathname + search` without the deep-link parameter and tracking parameters,
so two pages of one site never share markers and a deep-linked page still
matches its own feedback.

### Injection and permissions

Install-time permissions: `activeTab`, `scripting`, `storage`,
`unlimitedStorage`. None produces an install warning, and the extension can
touch a page only after the reviewer switches it on there.

- Opening the popup, or pressing the toggle shortcut, grants `activeTab`.
  The switch asks the background to inject `content.js` into that tab and
  records the tab id.
- While the grant lasts (same-origin navigations in that tab), the background
  re-injects when a load completes, so markers follow the reviewer across
  pages. When injection is refused (the grant ended on a cross-origin
  navigation) the tab is dropped from the set and the switch reads off.
- The widget's own History patch runs in the content script's isolated world
  and never sees the page's `pushState`. The background forwards
  `tabs.onUpdated` URL changes to the content script, which refreshes.
- Posting to Slack requests the optional host permission
  `https://hooks.slack.com/*` at the click that sends.

A per-site "always on" mode is left out: `tabs.captureVisibleTab` only works
under `activeTab` or `<all_urls>`, so always-on would either lose screenshots
or need access to every site.

The content script is a single IIFE with a re-injection guard.

### Screenshots

The extension bundle swaps the widget's `screenshot.ts` for its own module at
build time (an esbuild `onResolve` alias in `apps/extension/build.mjs`). The
replacement keeps the exported signature, hides SitePing's own chrome for two
frames, asks the background for `tabs.captureVisibleTab`, and crops the padded
rect on a canvas. This gives pixel-true captures including cross-origin
images, canvas and video. When the browser refuses the capture, the
replacement falls back to the widget's original implementation.

The swap is the one non-obvious choice. It exists because the alternative, a
capture hook on the widget's config, changes a 1.0 public API in a fork that
must stay mergeable with upstream. Guards: the build fails if the alias never
matched, and a type test pins the replacement to the original's signature.

### PDF export

A real `.pdf` download produced in the review page with no dependency:

- `pdf/writer.ts` — a small PDF 1.4 writer: objects, xref, pages, Flate
  streams through `CompressionStream`, JPEG images embedded as `DCTDecode`
  (the stored screenshots are already JPEG), raw RGB images, link annotations.
- `pdf/metrics.ts` — Helvetica and Helvetica-Bold advance widths for
  WinAnsi, generated from the Adobe AFM files, for wrapping and alignment.
- `pdf/report.ts` — the layout: a cover band with the site, date and counts
  by status and type, then one card per feedback with its number, type and
  status chips, message, page link, author, date, viewport, and the
  screenshot with the annotated region outlined.
- Text outside WinAnsi (Cyrillic, CJK, emoji) cannot be written with the
  standard fonts. Such a paragraph is drawn on a canvas with the system font
  and embedded as an image, so the content is never replaced by `?`.

Print-to-PDF was rejected: it needs the user to pick a destination in the
print dialog and browsers add their own header and footer. A PDF library was
rejected: none solves Unicode without shipping megabytes of fonts, and the
subset the report needs is small.

### Slack export

- `slack/message.ts` — pure functions from feedback to Block Kit payloads:
  header, summary context, one section per feedback, split into several
  messages under Slack's 50-block and 3000-character limits. User text is
  escaped (`&`, `<`, `>`) so it cannot inject mentions or links.
- Send: `POST` the payloads in order to the stored webhook; the response
  body (`ok`, `invalid_payload`, `no_service`, …) is surfaced.
- Copy: the same content as `text/plain` and `text/html` on the clipboard
  for pasting into Slack's composer, for users without a webhook.
- Only `https://hooks.slack.com/` URLs are accepted. Screenshots are not
  sent: a webhook cannot upload files, and the message says the PDF has them.

### Safari

Same sources, `--target safari`: the manifest declares the background as
`scripts` (Safari runs it as a non-persistent page) where the Chrome manifest
declares `service_worker`. Every API used exists in Safari 16.4 or later
(`storage.session` sets the floor; `unlimitedStorage` is honoured from 16).
A Safari web extension must ship inside an app, so `apps/extension/scripts/safari.mjs` runs
`xcrun safari-web-extension-converter` on the built folder (macOS only). CI
runs it on a macOS runner and builds the app unsigned with `xcodebuild`.

## Files

New, all under `apps/extension/`:

- `package.json`, `tsconfig.json`, `build.mjs`, `manifest.json` (template),
  `scripts/safari.mjs`, `README.md`
- `src/shared/` — `messages.ts` (RPC protocol), `records.ts` (storage keys,
  serialization, revival), `settings.ts`, `browser.ts` (typed `chrome`
  surface), `scope.ts` (project and page identity)
- `src/background/` — `index.ts`, `store.ts`, `injection.ts`
- `src/content/` — `index.ts`, `remote-store.ts`, `screenshot.ts`
- `src/pdf/` — `writer.ts`, `metrics.ts`, `winansi.ts`, `jpeg.ts`,
  `report.ts`, `raster.ts`
- `src/slack/` — `message.ts`, `send.ts`
- `src/ui/` — `popup.html|ts`, `review.html|ts`, `styles.css`, icons
- `__tests__/` — unit tests for every module above

Changed elsewhere: `vitest.config.ts` (collect `apps/extension/__tests__`),
`knip.json`, `.github/workflows/extension.yml` (new), `e2e/extension.spec.ts`
(new), root `README.md` and `CLAUDE.md` (one section each), `wiki/`.

## Validation

- Unit (vitest): store diffing and revival over a fake `storage.local`; RPC
  round trip; injection decisions; capture geometry; WinAnsi encoding and
  wrapping; JPEG header parsing; the PDF parsed back by `pdfjs-dist` (page
  count, text, image count); Slack payload limits and escaping; webhook URL
  validation.
- End to end (Playwright, Chromium with the unpacked build): switch the
  widget on from the popup, annotate a fixture page, find the feedback and
  its screenshot in the review page, download the PDF, and post to a local
  stand-in for the Slack webhook.
- Visual: render the generated PDF to PNG and inspect it.
- Safari: converter and unsigned `xcodebuild` on a macOS runner.
- Repository gate: `bun run verify`, `bun run check:consistency`, `knip`.

## Risks

- Safari runtime behaviour cannot be exercised from Linux. MDN's
  compatibility data says every API is there; the CI job proves the build,
  not the runtime, and the README says what was and was not verified.
- `activeTab` ends on cross-origin navigation; the switch then reads off
  until the reviewer turns it on again (one click or one shortcut).
- A storage write can still be refused. The engine already retries a
  rejected write without its screenshot, so the text survives.
- Playwright cannot click the toolbar, so the e2e run loads a copy of the
  build whose manifest also holds `<all_urls>`, standing in for the grant a
  click gives. The shipped manifest is asserted separately.
