# Tasks: Browser metadata in extension annotations

**Plan**: `./plan.md`

Tasks are dependency ordered. `[P]` tasks in the same phase touch independent
files and may be completed together.

## Phase 1: Formatter contract

- [x] T001 Add `EnvironmentMetadata`, ordered browser/OS/device detection, and
      viewport normalization in `apps/extension/src/shared/environment.ts`.
- [x] T002 Add table-driven browser, OS/device, viewport, and unknown-input tests
      in `apps/extension/__tests__/environment.test.ts` (depends on T001).

## Phase 2: View model and surfaces

- [x] T003 Extend `ReportItem`/`toReport` with derived metadata in
      `apps/extension/src/shared/report.ts` and update
      `apps/extension/__tests__/report-model.test.ts` (depends on T001).
- [x] T004 [P] Show the environment line on review cards in
      `apps/extension/src/ui/review.ts` (depends on T001).
- [x] T005 [P] Render environment context in PDF cards in
      `apps/extension/src/pdf/report.ts` and update
      `apps/extension/__tests__/report.test.ts` (depends on T003).
- [x] T006 [P] Render environment context in Slack and clipboard output in
      `apps/extension/src/slack/message.ts` and update
      `apps/extension/__tests__/message.test.ts` (depends on T003).

## Phase 3: Documentation and validation

- [x] T007 [P] Document displayed/exported environment metadata and privacy in
      `apps/extension/README.md` (depends on T004–T006).
- [x] T008 Run focused Vitest suites and extension check/build; fix failures
      (depends on T001–T007).
- [x] T009 Run full `bun run verify`, `bun run check:consistency`, `bun run knip`,
      extension e2e, and verify no `packages/*` source diff (depends on T008).
      Extension tests (250), check/build, consistency, lint, knip, and the
      package boundary pass. Full verify passes 4,947 tests with 30 skipped
      except the documented NixOS Prisma engine suite (zero tests run). The e2e
      runner cannot start Playwright Chromium because this sandbox lacks
      `libglib-2.0.so.0`; Ubuntu CI supplies the browser runtime.
- [x] T010 Run independent Codex review, address confirmed findings, and rerun
      affected checks until no significant findings remain (depends on T009).
- [x] T011 Update `wiki/browser-extension.md` and `wiki/index.md` with reusable
      lessons tagged `vk/64b1-add-browser-meta` (depends on T010).
- [x] T012 Commit, push, create the SitePing PR with Vibe Kanban, wait for green
      required CI, and merge (depends on T011).
