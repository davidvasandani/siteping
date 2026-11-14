# Implementation Plan: SitePing browser extension (Chrome and Safari)

**Spec**: `./spec.md`
**Status**: Ready for tasks

## Technical Context

- TypeScript 5.9, strict with `exactOptionalPropertyTypes`, ES2022, bun
  workspaces, Turborepo, biome, vitest 5, Playwright 1.64 (`tsconfig.base.json`,
  `turbo.json`, `biome.json`, `vitest.config.ts`, `playwright.config.ts`).
- WebExtension Manifest V3. Chrome 116+ (service worker background), Safari
  16.4+ on macOS (background scripts as a non-persistent page).
- Bundler: esbuild 0.28 (already installed for the widget's tooling), driven
  by a node script, not tsup: the outputs are IIFE scripts and static files
  for a browser extension, not a library.
- Storage: `storage.local` with `unlimitedStorage`; `storage.session` for the
  set of switched-on tabs.
- No runtime dependency beyond the workspace's `@siteping/core` and
  `@siteping/widget`, both bundled from source.

## Architecture & Approach

A new private workspace `apps/extension` (workspaces already include
`apps/*`, see root `package.json`). Nothing under `packages/*` is edited
(constitution VIII).

```
apps/extension/
  package.json  tsconfig.json  README.md
  scripts/build.mjs  scripts/icons.mjs  scripts/safari.mjs
  src/manifest.json                      template, per-target background key
  src/shared/    browser.ts scope.ts records.ts settings.ts messages.ts labels.ts report.ts
  src/background/ index.ts store.ts tabs.ts handler.ts
  src/content/   index.ts remote-store.ts screenshot.ts capture-area.ts
  src/pdf/       winansi.ts metrics.ts jpeg.ts writer.ts report.ts raster.ts
  src/slack/     message.ts send.ts
  src/ui/        popup.html popup.ts review.html review.ts review-model.ts styles.css
  __tests__/     one test file per module
```

How the requirements map:

| Requirement | Where |
| --- | --- |
| FR-1, FR-4 switch on/off, shortcut, unsupported pages | `background/tabs.ts`, `ui/popup.ts`, manifest `commands` |
| FR-2 widget behaviour | `content/index.ts` calls `initSiteping` from `packages/widget/src/index.ts` in store mode |
| FR-3 persistence across navigation | `background/tabs.ts` re-injects on `tabs.onUpdated` `status: "complete"`, forwards URL changes; `shared/scope.ts` |
| FR-5 off means untouched | no declared content script; injection only through `scripting.executeScript` |
| FR-6 to FR-10 storage | `background/store.ts` over `createCollectionStore` (`packages/core/src/store-helpers.ts`), `shared/records.ts` |
| FR-8 concurrent tabs | single writer: every write is a message to the background (constitution X) |
| FR-11, FR-12 screenshots | `content/screenshot.ts` + `tabs.captureVisibleTab` in `background/handler.ts` |
| FR-13 to FR-17 review page | `ui/review.ts`, `ui/review-model.ts`, `shared/settings.ts` |
| FR-18 to FR-22 PDF | `pdf/*` |
| FR-23 to FR-28, FR-31 Slack | `slack/*`, `shared/settings.ts` |
| FR-29, FR-30 permissions | `src/manifest.json`, asserted by `__tests__/build.test.ts` |
| FR-32, FR-33 browsers, builds | `scripts/build.mjs`, `scripts/safari.mjs`, `.github/workflows/extension.yml` |
| FR-34 packages untouched | `git diff --stat main -- packages/` is empty |

### Widget in a content script

`content/index.ts` runs in the isolated world. The widget needs only DOM
access (it creates a `<siteping-widget>` element without registering a custom
element, `packages/widget/src/launcher.ts:343`), so it runs there unchanged.
Three differences from an embedded widget are handled in the extension:

1. `forceShow: true`: the launcher hides the widget on public pages.
2. SPA navigation: the widget's History patch cannot see the page world's
   `pushState`. The background forwards `tabs.onUpdated` URL changes and the
   content script calls `instance.refresh()`.
3. Identity: the widget would ask once per site and keep the answer in that
   site's `localStorage`. The extension passes `identity` from its own
   settings so one answer covers every site.

One thing the widget still keeps in the site's `localStorage` while it is on:
the ids behind its "Mine" filter (`packages/widget/src/own-feedback.ts`). It
is local and small; the README's privacy section states it (spec FR-30a).

### Screenshot seam

`scripts/build.mjs` registers an esbuild `onResolve` that redirects
`./screenshot.js` imported from `packages/widget/src/annotator.ts` to
`apps/extension/src/content/screenshot.ts`. That module exports
`captureAnnotatedScreenshot` with the original's type, tries the tab capture,
and on any failure calls the original (imported by relative path, which the
redirect does not touch). The build throws if the redirect matched zero
times, so an upstream rename is a build failure, not a silent regression.

### Build

`scripts/build.mjs` writes `dist/chrome` and `dist/safari`: four bundles
(`background.js`, `content.js`, `popup.js`, `review.js`), the HTML and CSS
files, icons rendered by `scripts/icons.mjs` (a small PNG encoder, so no
binary is committed), and `manifest.json` with the version from
`package.json`. Turbo's existing `build` task (`dependsOn: ["^build"]`,
inputs `src/**`, `scripts/**`) covers it without a `turbo.json` change.

## Data Model

See `./data-model.md`.

## Contracts

See `./contracts/messages.md` (runtime messages), `./contracts/manifest.md`
(shipped manifests) and `./contracts/slack.md` (webhook payload).

## Research Notes

See `./research.md`.

## Constitution Check

- I Clarity: one non-obvious choice, the screenshot seam, justified in
  `research.md` (R3) with its guard.
- II Test the contract: every acceptance criterion in the spec maps to a unit
  test, the extension e2e, or the Safari CI job (`research.md`, R10).
- III Small steps: a per-site permanent mode, a translated UI and store
  publication are left out and listed as such.
- IV, V, VI: not applicable (no MCP configuration, Settings host scope or
  layout-mode chrome is touched).
- VII Bundled executable entries: the extension bundles only workspace code;
  no third-party runtime code is added. `pdfjs-dist`, `@types/chrome` are
  development-only and pinned by `bun.lock`.
- VIII Fork mergeability: all changes are in `apps/extension`, new workflow
  and e2e files, and additive lines in `vitest.config.ts`, `knip.json`,
  `playwright.config.ts`, `README.md`, `CLAUDE.md`. No `packages/*` source
  edit.
- IX Local-first: required permissions are `activeTab`, `scripting`,
  `storage`, `unlimitedStorage`; the only host is the optional
  `https://hooks.slack.com/*`, requested at the send click; the build test
  asserts the manifest.
- X One writer: the background is the only writer of both feedback and
  settings; a test sends two creates from two clients and expects both
  records.
- Widget navigation amendment: page identity is one function
  (`shared/scope.ts`) used for both the stored `url` and `getPageScope`.
- Constraints: new dependencies are recorded in `research.md` (R9).

No deviation.

## Risks & Dependencies

- Safari runtime is unverified here (research R8). Mitigation: only APIs MDN
  lists for Safari 16.4, a capture fallback, and a CI compile.
- The screenshot seam depends on the widget's internal file layout. Mitigation:
  the must-match guard and a type test.
- A handwritten PDF writer can emit a file one reader accepts and another
  rejects. Mitigation: parse with `pdfjs-dist` in tests, render with `mutool`
  during development, keep to PDF 1.4 features.
- Playwright cannot press the toolbar button. Mitigation: the e2e loads a copy
  of the build with `<all_urls>` added, and the shipped manifest is asserted
  by a unit test.
- Depends on `packages/widget` and `packages/core` sources as they are on
  `main` today.
