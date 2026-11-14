---
title: Browser extension (apps/extension): the widget on any site, local only
tags: [extension, chrome, safari, widget, storage, permissions, e2e]
tasks: [vk/e5c0-siteping-chrome, vk/48b5-siteping-extensi]
---

# Browser extension

## Screen recordings

Task `vk/48b5-siteping-extensi` adds Chrome-only current-tab video as an
extension-side sidecar keyed by feedback id. Chrome's service worker obtains a
`tabCapture` stream id after the reviewer invokes Record; an offscreen document
owns MediaRecorder and is the sole writer of `siteping-recordings` IndexedDB.
Review pages read Blob values directly, just as they read large feedback data
directly, and create short-lived object URLs for playback/download.

The hard limit is two minutes, video only. Tab navigation keeps recording;
closing the popup does not. The on-page pill is deliberately visible in the
video, unlike screenshot capture, because recording promises the page as the
reviewer saw it. PDF receives a poster/duration/note and Slack receives only a
local-recording note. Neither receives video bytes.

Deleting feedback through either UI must pass through the background and then
delete the IndexedDB sidecar. Chrome adds `tabCapture` and `offscreen` without
host access. Safari omits both permissions and exposes an unavailable state;
converter/build success does not imply recording support.

**Where:** `apps/extension` (private, fork-only, Manifest V3). User-facing
description in `apps/extension/README.md`; this page is what is not obvious
from the code.

## Shape
- The unmodified widget runs in a content script, in store mode. Nothing in
  `packages/*` is edited, so upstream merges stay clean.
- The background owns the only `createCollectionStore` (over `storage.local`,
  one key `fb:<id>` per feedback, changed keys only). Every other context
  sends it messages. The engine's mutation queue is per instance and per JS
  realm, so a store per tab would lose writes; settings go through the
  background too. Extension pages may *read* storage directly: a whole review
  with its screenshots is too large for one runtime message.
- Project = page origin. Page identity = path + query minus `siteping` (the
  deep-link parameter) and tracking parameters, one function for both the
  stored `url` and `getPageScope`.

## The widget in a content script's isolated world
- It needs `forceShow: true` (it hides itself on public pages).
- Its History patch cannot see the page world's `pushState`. The background
  forwards `tabs.onUpdated` URL changes; the content script calls
  `instance.refresh()`.
- It would ask for an identity per site and keep it in that site's
  `localStorage`; pass `identity` from extension settings instead. It still
  keeps its "Mine" ids in the site's `localStorage`.
- The launcher never registers a custom element (`<siteping-widget>` is a
  plain unknown element), so the widget does not depend on `customElements`
  being available to content scripts.
- A page restored from the back/forward cache keeps the widget without
  re-running the script: reconcile on `pageshow` (`event.persisted`).

## Permissions
- `tabs.captureVisibleTab` works only under `activeTab` or `<all_urls>`. A
  host permission for one site is not enough. That is why there is no
  per-site "always on" mode: it would lose screenshots or need every site.
- `activeTab` is documented to last while the tab stays on the same origin,
  so the background re-injects on `status: "complete"`; a refused injection
  means the grant ended, and the tab is switched off. This path is unit-tested
  but not exercised by the e2e, which holds `<all_urls>` instead. Do not rely
  on the browser clearing a per-tab badge on navigation; clear it.
- `permissions.request` must start inside the click handler. A dialog's
  `close` event is a later task, where Safari may not count the gesture.
- Safari 16.4 is the floor (`storage.session`); `unlimitedStorage` is fully
  honoured from 16; `captureVisibleTab` defaults to JPEG there, so pass the
  format. Source: MDN browser-compat-data, 2026-11.

## Screenshots: the seam
`scripts/seam.mjs` redirects the annotator's `./screenshot.js` import to
`src/content/screenshot.ts` at bundle time, and the build throws if the
redirect matched nothing. The replacement is typed `typeof` the original, so
a signature change fails `tsc`. It hides SitePing's chrome with
`opacity: 0 !important` plus `transition: none` (a descendant can override
`visibility`, and a fade would be captured), waits two animation frames,
captures, crops with `createImageBitmap` (loading a `data:` URL as an image
can be blocked by the page's CSP), and falls back to the widget's
html2canvas renderer. Chrome to hide: `siteping-widget`,
`[data-siteping-ignore="true"]`, `#siteping-markers`.

## Things that cost time
- Chrome gives an extension page's `body` a font size of 75%. Set the size on
  `body`, not `:root`.
- A stored path can start with `//` (a valid path). Resolving it against the
  origin changes the host. Join origin and path as text and check the origin.
- A confirmation that says what will be sent must snapshot it: the list can
  change underneath an open dialog (`storage.onChanged`).
- Any redraw re-enables buttons unless running operations are tracked.
- Never put invisible characters in source. Write them as code points
  (`String.fromCodePoint(0x200d)`); `\u` escapes typed through an agent's
  tool call were decoded into literal characters once.

## Testing
- Unit tests run over `__tests__/fake-api.ts`, an in-memory extension API
  that round-trips values through JSON like the real channels.
  `shared/browser.ts` is the port; its `return` type-checks the port against
  `@types/chrome`.
- `e2e/extension.spec.ts` launches its own persistent Chromium with a copy of
  the build. Playwright cannot click the toolbar, so the copy's manifest gets
  `<all_urls>` in place of the `activeTab` grant, and the popup is opened as a
  page with `?tabId=`. The shipped manifest is asserted in
  `__tests__/build.test.ts`.
- The widget's button is in a closed shadow root. Reach it by evaluating in
  the content script's isolated world over CDP (`Runtime.enable`, context with
  `auxData.type === "isolated"` and the extension's name) and
  `chrome.dom.openOrClosedShadowRoot`. The overlay and comment box are light
  DOM and take ordinary locators.
- `context.grantPermissions(["clipboard-read"], { origin })` rejects an
  extension origin; grant context-wide.
- Locally: `SITEPING_CHROMIUM=/run/current-system/sw/bin/chromium` (NixOS).
  With a full Chromium binary, `headless: true` loads extensions.
- `packages/adapter-prisma/__tests__/sqlite-conformance.test.ts` cannot run
  on NixOS (no Prisma engine build); it is not a regression.

## Packaging
`.github/workflows/extension.yml` builds both targets and, on macOS, runs
`xcrun safari-web-extension-converter` and an unsigned `xcodebuild`. Each run
attaches the Chrome folder and the unsigned app. Not signed, not published,
not released by tag. Related: [fork releases](fork-releases.md).

What the macOS job showed (macos-15, Xcode 16.4):
- The converter lists manifest keys Safari does not support. It flagged
  `background.persistent`; nothing else in this manifest. Declare the Safari
  background as `{ "scripts": [...] }` only. Read that warning after any
  manifest change: it is the cheapest Safari signal available without a Mac.
- With `--project-location X --app-name SitePing --macos-only`, the project is
  `X/SitePing/SitePing.xcodeproj` and the extension is built as
  `SitePing Extension.appex` inside `SitePing.app`.
- `xcodebuild ... CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO
  CODE_SIGN_IDENTITY="" build` compiles it unsigned in about half a minute.
- This proves the build, not the behaviour: the extension has not been run in
  Safari.
