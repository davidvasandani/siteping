# Research: SitePing browser extension

Each note: the decision, why, and what was rejected. "Checked" says how.

## R1. Where the code lives

**Decision**: a private app `apps/extension`.
**Why**: `packages/*` is what release-please, `api:check`, `pkg-checks` and
`check:consistency` treat as published libraries; the extension is an
application like `apps/demo`. A fork-only directory never conflicts with an
upstream merge.
**Rejected**: `packages/extension` (would need registration in five places
that exist for npm packages); a separate repository (loses source-level reuse
of the widget and core).

## R2. Who writes the store

**Decision**: the background context owns one `createCollectionStore` and is
the only writer. Content scripts and extension pages send messages.
**Why**: the engine serialises mutations per instance in one JS realm
(`packages/core/src/store-helpers.ts`, doc comment on the function). Two tabs
each with their own instance over the same storage would lose writes.
**Rejected**: an instance per tab with `storage.local` as the meeting point
(the documented unsafe case); IndexedDB transactions (more code, no change
events for the review page, and Safari background pages make it no simpler).
**Storage shape**: one key per feedback, written on change only. A single
blob would rewrite every screenshot on every mutation.

## R3. Screenshots

**Decision**: `tabs.captureVisibleTab` cropped in the content script, swapped
in for the widget's `html2canvas-pro` module at bundle time, with the original
as fallback.
**Why**: `packages/widget/src/screenshot.ts` returns `null` when the canvas is
tainted, which any cross-origin image without CORS headers causes. On sites
the reviewer does not control that is the normal case. A tab capture is the
real pixels.
**Checked**: `captureVisibleTab` needs `activeTab` or `<all_urls>` (Chrome
documentation; MDN compat lists Safari 14 with "`<all_urls>` permission is
optional" and "The default file format is 'jpeg'", so the format is passed
explicitly).
**Rejected**: a `captureScreenshot` option on the widget config: cleaner, but
it edits `packages/core/src/types.ts` and the widget, changes the committed
API snapshots, and conflicts with upstream on every sync (constitution VIII).
It is the right upstream contribution later; the seam can then be deleted.
**Consequence**: no permanent per-site mode in this version. Keeping a site
on without a click needs a host permission for it, and a host permission
does not allow `captureVisibleTab`; only `<all_urls>` does.

## R4. PDF generation

**Decision**: a small PDF 1.4 writer in `src/pdf/`, no library.
**Why**: the export must be a file download without a dialog (FR-18), offline,
in both browsers. The report needs filled shapes, two fonts, JPEG images and
links, which is a few hundred lines. The stored screenshots are JPEG, which a
PDF embeds byte for byte (`DCTDecode`).
**Rejected**:
- `window.print()` to "Save as PDF": a dialog, a destination the user must
  pick, browser headers and footers, no way to test the result.
- `pdf-lib` or `jsPDF`: 350 kB to 1 MB of bundled code, and neither solves
  the hard part (R5) without shipping fonts.
- `chrome.debugger` `Page.printToPDF`: a "debugging this browser" banner, a
  frightening permission, Chrome only.
**Checked**: Helvetica and Helvetica-Bold advance widths were generated from
Adobe's Core 14 AFM files (as redistributed by PDFKit) by glyph name for
WinAnsi codes 32 to 255. Ascender 718, descender -207 for both.
`CompressionStream("deflate")` produces the zlib stream `FlateDecode` expects
(Chrome 80, Safari 16.4, Node 18).

## R5. Text the standard fonts cannot write

**Decision**: a paragraph whose characters all exist in WinAnsi is written as
text with the standard fonts. Any other paragraph (Cyrillic, CJK, emoji,
arrows) is drawn on a canvas with the system font at three times the print
size and embedded as an image.
**Why**: FR-21 forbids placeholder characters. Embedding a font that covers
CJK means megabytes inside the extension, and a subsetter to go with it.
**Trade-off**: such a paragraph cannot be selected or searched. The common
case (Latin scripts, including the French, German, Spanish, Italian and
Portuguese the widget ships) stays real text.
**Rejected**: replacing unknown characters with `?`; rasterising whole pages.

## R6. Slack

**Decision**: Incoming Webhook, Block Kit, plus a clipboard copy.
**Why**: the only Slack mechanism without a hosted component. Limits applied:
50 blocks per message, 3000 characters per section text, 150 per header.
**Escaping**: `&`, `<`, `>` in reviewer text become entities, which is what
Slack documents for mrkdwn; `<!channel>` and `<url|label>` then render
literally. Formatting characters are left alone inside a quoted block.
**Permission**: `https://hooks.slack.com/*` as an optional host permission
requested at the click. A `no-cors` request would need no permission but
hides Slack's answer, and FR-27 wants it shown.
**Rejected**: bot token with `chat.postMessage` and file upload: a token with
workspace scope stored in the browser, and a Slack app to distribute.

## R7. Switching on

**Decision**: `activeTab` + `scripting.executeScript`, state per tab in
`storage.session`, re-injection on completed loads, a `commands` shortcut.
**Why**: no install-time host access (constitution IX). Chrome keeps the
`activeTab` grant across same-origin navigations in the tab, so a multi-page
review needs one click.
**Rejected**: a declared content script on `<all_urls>`: the widget would be
in every page, and the install prompt would read "all your data on all
websites".

## R8. Safari

**Decision**: one source tree, a `safari` build whose manifest declares
`background.scripts`, and `xcrun safari-web-extension-converter` to wrap it in
an app. CI compiles it unsigned on a macOS runner.
**Checked** (MDN browser-compat-data, 2026-11-14): Safari supports
`optional_host_permissions` 15.5, `background.service_worker` 15.4,
`scripting.executeScript` 15.4, `tabs.captureVisibleTab` 14,
`permissions.request` 14, `storage.session` 16.4, `unlimitedStorage` fully
from 16. Floor: 16.4.
**Not checked**: behaviour in a running Safari. No macOS browser is available
to this task. The README says so.

## R9. Dependencies added

All in `apps/extension` `devDependencies`; none ships to users.

| Package | Why | Alternative considered |
| --- | --- | --- |
| `@types/chrome` | Types for the extension APIs; a compile-time assignment keeps the hand-written port in `shared/browser.ts` equal to the real signatures | Hand-written types only: nothing would catch a wrong signature |
| `pdfjs-dist` | An independent PDF parser in tests: the writer is handwritten, so "our own reader accepts it" proves nothing | Structural assertions only; `mutool` (not available in CI) |
| `esbuild` | Already in the lockfile through the widget; listed because `scripts/build.mjs` imports it | tsup: library-oriented, no need for d.ts or dual formats here |

## R10. Validation map

| Acceptance criterion (spec) | Evidence |
| --- | --- |
| Switch on, annotate, survives reload | e2e |
| Same-site navigation keeps it on, per-page markers | e2e; `tabs.test.ts`; `scope.test.ts` |
| Screenshot matches the page, no SitePing chrome | e2e (pixel probe of a known colour); `screenshot.test.ts` |
| Two tabs at once | `store.test.ts` (two clients, one background) |
| Review page: two sites, filter, live update | e2e; `review-model.test.ts` |
| PDF opens, text searchable, links, Japanese and emoji | `report.test.ts` (pdfjs-dist); e2e download; rendered PNG looked at |
| Slack accepted, limits, rejection reported | `message.test.ts`, `send.test.ts`; e2e against a routed stand-in |
| `<!channel>` literal | `message.test.ts` |
| Copy for Slack | e2e |
| Manifest has no required host access; nothing injected when off | `build.test.ts`; e2e |
| No network request while annotating | e2e request log |
| Chrome loads unpacked; Safari converts and compiles | e2e; macOS CI job |
| `bun run verify`, packages unchanged | gate; `git diff --stat` |
| 200 items in under 10 s, page responsive (FR-22) | `report.test.ts` times a 200-item export with screenshots; the builder awaits between cards |
| Says what is sent before sending (FR-30) | e2e reads the send confirmation text |

A real Slack workspace is not available to this task: "Slack accepts it" is
validated against Slack's documented limits and a stand-in, not a live post.
