# Tasks: SitePing browser extension (Chrome and Safari)

**Plan**: `./plan.md`

Tasks are ordered by dependency. Tasks marked **[P]** touch independent files
and may run in parallel within their group. Each task names the file(s) it
changes. Paths are relative to the repository root. A task that adds a module
adds its test file in the same task.

## Phase 1: Setup
- [x] T001 Create the workspace: `apps/extension/package.json`,
      `apps/extension/tsconfig.json`; run `bun install` (updates `bun.lock`)
- [x] T002 Collect the extension's tests and resolve the widget from source:
      `vitest.config.ts`; register the workspace in `knip.json` (depends on T001)

## Phase 2: Shared kernel
- [x] T003 [P] Extension API port (including `storage.onChanged`) and binding in
      `apps/extension/src/shared/browser.ts`; in-memory fake in
      `apps/extension/__tests__/fake-api.ts`
- [x] T004 [P] Project and page identity in
      `apps/extension/src/shared/scope.ts`, `apps/extension/__tests__/scope.test.ts`
- [x] T005 [P] Storage keys, serialisation and lenient revival in
      `apps/extension/src/shared/records.ts`, `apps/extension/__tests__/records.test.ts`
- [x] T006 [P] Settings, normalisation and webhook address validation in
      `apps/extension/src/shared/settings.ts`, `apps/extension/__tests__/settings.test.ts`
- [x] T007 [P] Type and status labels and colours in
      `apps/extension/src/shared/labels.ts`
- [x] T008 Message protocol, wire errors and `call()` in
      `apps/extension/src/shared/messages.ts`,
      `apps/extension/__tests__/messages.test.ts` (depends on T003)

## Phase 3: Core (four independent groups)

### Background
- [x] T009 Single-writer store over `storage.local` in
      `apps/extension/src/background/store.ts`,
      `apps/extension/__tests__/store.test.ts`, covering changed-keys-only
      writes, a refused write that keeps the text without its screenshot
      (FR-9) and two clients creating at once (FR-8) (depends on T003, T005)
- [x] T010 [P] Tab controller (enable, disable, re-inject, forward navigation)
      in `apps/extension/src/background/tabs.ts`,
      `apps/extension/__tests__/tabs.test.ts` (depends on T003)
- [x] T011 Message handler (store calls, settings, capture, tab state, stats) in
      `apps/extension/src/background/handler.ts`,
      `apps/extension/__tests__/handler.test.ts` (depends on T008, T009, T010)
- [x] T012 Background entry wiring `runtime.onMessage`, `tabs.onUpdated`,
      `tabs.onRemoved` and the `commands.onCommand` shortcut in
      `apps/extension/src/background/index.ts` (depends on T011)

### Content script
- [x] T013 [P] `SitepingStore` over messages in
      `apps/extension/src/content/remote-store.ts`,
      `apps/extension/__tests__/remote-store.test.ts` (depends on T008)
- [x] T014 [P] Capture geometry in `apps/extension/src/content/capture-area.ts`,
      `apps/extension/__tests__/capture-area.test.ts`
- [x] T015 Tab-capture screenshot with fallback in
      `apps/extension/src/content/screenshot.ts`,
      `apps/extension/__tests__/screenshot.test.ts`; the export is typed
      `typeof` the widget's original, so `tsc` is the signature test
      (depends on T008, T014)
- [x] T016 Content controller (mount, unmount, refresh) in
      `apps/extension/src/content/controller.ts`, entry in
      `apps/extension/src/content/index.ts`,
      `apps/extension/__tests__/content.test.ts` (depends on T004, T006, T013)

### PDF
- [x] T017 [P] WinAnsi encoding in `apps/extension/src/pdf/winansi.ts`,
      `apps/extension/__tests__/winansi.test.ts`
- [x] T018 [P] JPEG header parsing in `apps/extension/src/pdf/jpeg.ts`,
      `apps/extension/__tests__/jpeg.test.ts`
- [x] T019 Font metrics, wrapping and truncation in
      `apps/extension/src/pdf/metrics.ts`,
      `apps/extension/__tests__/metrics.test.ts` (depends on T017)
- [x] T020 PDF writer in `apps/extension/src/pdf/writer.ts`,
      `apps/extension/__tests__/writer.test.ts` (depends on T017, T018)
- [x] T021 Report model (`Report`, `ReportItem`, `toReport`) in
      `apps/extension/src/shared/report.ts`,
      `apps/extension/__tests__/report-model.test.ts` (depends on T004, T007)
- [x] T022 Report layout in `apps/extension/src/pdf/report.ts`,
      `apps/extension/__tests__/report.test.ts`, including a 200-item export
      under 10 seconds (FR-22) (depends on T019, T020, T021)
- [x] T023 [P] Canvas rasteriser and JPEG conversion in
      `apps/extension/src/pdf/raster.ts`, `apps/extension/__tests__/raster.test.ts`

### Slack
- [x] T024 [P] Block Kit and clipboard builders in
      `apps/extension/src/slack/message.ts`,
      `apps/extension/__tests__/message.test.ts` (depends on T021)
- [x] T025 [P] Sender and error reporting in `apps/extension/src/slack/send.ts`,
      `apps/extension/__tests__/send.test.ts`

## Phase 4: Interface
- [x] T026 Review view-model (filters, counts, selection, file name) in
      `apps/extension/src/ui/review-model.ts`,
      `apps/extension/__tests__/review-model.test.ts` (depends on T021)
- [x] T027 [P] Shared styles in `apps/extension/src/ui/styles.css`
- [x] T028 [P] Popup in `apps/extension/src/ui/popup.html`,
      `apps/extension/src/ui/popup.ts`, DOM helper in
      `apps/extension/src/ui/dom.ts` (depends on T008)
- [x] T029 Review page in `apps/extension/src/ui/review.html`,
      `apps/extension/src/ui/review.ts`, with a send confirmation that states
      what goes to Slack (FR-30)
      (depends on T022, T023, T024, T025, T026)

## Phase 5: Build and packaging
- [x] T030 [P] Icon renderer in `apps/extension/scripts/icons.mjs`
- [x] T031 Manifest template, build script and screenshot seam in
      `apps/extension/src/manifest.json`, `apps/extension/scripts/build.mjs`,
      `apps/extension/scripts/seam.mjs`,
      `apps/extension/__tests__/build.test.ts` (depends on T012, T016, T028,
      T029, T030)
- [x] T032 [P] Safari packaging script in `apps/extension/scripts/safari.mjs`

## Phase 6: Validation
- [x] T033 End-to-end run in `e2e/extension.spec.ts`, which launches its own
      Chromium with the extension and skips on the other browsers, so
      `playwright.config.ts` is not edited (depends on T031)
- [x] T034 Render a sample PDF with `mutool`: it must convert without a
      warning, and the PNG of each page is looked at; fix what reads badly in
      `apps/extension/src/pdf/report.ts` (depends on T022)
- [x] T035 [P] CI workflow in `.github/workflows/extension.yml`, passing
      `actionlint` (depends on T031, T032)
- [x] T036 [P] Documentation in `apps/extension/README.md`, `README.md`,
      `CLAUDE.md` (depends on T031)
- [x] T037 Gates: `bun run verify`, `bun run check:consistency`,
      `bun run knip`, the extension e2e, and an empty
      `git diff --stat main -- packages/` (depends on all above). Result:
      all green except `packages/adapter-prisma/__tests__/sqlite-conformance.test.ts`,
      which cannot start on the NixOS build host (Prisma ships no engine for
      it) and is unrelated to this change; CI runs it on Ubuntu

<!--
Conventions:
- `T001` … task ids are stable and referenced by the dependency graph.
- `[P]` … parallel-safe (independent files). Omit for tasks that must be serial.
- `[ ]` / `[x]` … completion checkbox, toggled from the workbench.
-->
