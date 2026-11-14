# Tasks: SitePing extension screen recording

**Plan**: `./plan.md`

## Phase 1: Contracts and storage

- [x] T001 Extend browser API types/fakes for tab capture, offscreen contexts,
      and target detection in `src/shared/browser.ts` and `__tests__/fake-api.ts`
- [x] T002 [P] Add recording model, validation, duration/mime/filename helpers
      and tests in `src/recording/model.ts`, `__tests__/recording-model.test.ts`
- [x] T003 [P] Extend recording request/reply/content message contracts and
      protocol tests in `src/shared/messages.ts`, `__tests__/messages.test.ts`
- [x] T004 Implement IndexedDB schema/read/write/delete/recovery APIs and tests
      in `src/recording/database.ts`, `__tests__/recording-database.test.ts`
      (depends on T002)

## Phase 2: Recording engine

- [x] T005 Implement MediaRecorder lifecycle, codec negotiation, poster frame,
      timer, track-end and exactly-once finalization with tests in
      `src/recording/recorder.ts`, `__tests__/recorder.test.ts` (depends on T002)
- [x] T006 Add offscreen page/writer and focused tests in
      `src/offscreen/offscreen.html`, `src/offscreen/offscreen.ts`,
      `__tests__/offscreen.test.ts` (depends on T001, T003–T005)
- [x] T007 Add background recording coordinator, offscreen lifecycle, restart
      reconciliation and GC queue tests in `src/background/recording.ts`,
      `__tests__/recording-coordinator.test.ts` (depends on T001, T003, T006)
- [x] T008 Wire recording requests/commands/startup into
      `src/background/handler.ts`, `src/background/index.ts` and their tests
      (depends on T007)
- [x] T009 Cascade single/site feedback deletions and deleted-during-recording
      owner checks with handler tests (depends on T004, T007, T008)

## Phase 3: User interface

- [x] T010 [P] Build accessible content recording indicator and tests in
      `src/content/recording-indicator.ts`, content controller/tests
      (depends on T003)
- [x] T011 Extend popup owner selection, Record/Stop, timer, shortcut guidance,
      replacement confirmation and Safari unsupported state in
      `src/ui/popup.html|ts`, `src/ui/styles.css`, popup tests (depends on T007)
- [x] T012 Extend review page read/play/download/delete UI, Blob URL cleanup,
      and persistence tests in `src/ui/review.ts`, review/model tests
      (depends on T004, T008)

## Phase 4: Exports and packaging

- [x] T013 [P] Extend report model and PDF layout for poster, duration, and
      recording note with tests in `src/shared/report.ts`, `src/pdf/report.ts`
      (depends on T002, T004)
- [x] T014 [P] Extend Slack/clipboard recording note and limit tests in
      `src/slack/message.ts`, `__tests__/message.test.ts` (depends on T002)
- [x] T015 Split Chrome/Safari manifest permissions, add offscreen build entry
      and recording command, and update exact build tests in
      `src/manifest.json`, `scripts/build.mjs`, `__tests__/build.test.ts`
      (depends on T006)
- [x] T016 Update README and wiki for Chrome/Safari support, privacy, audio,
      limit, storage, permissions and lifecycle semantics

## Phase 5: Browser validation

- [x] T017 Add animated fixture and automated Chromium record/play/download/
      restart/limit flow in `e2e/extension.spec.ts` (depends on T010–T015)
- [x] T018 Add e2e cascade coverage for review delete, widget delete, and site
      Delete all; verify no-recording export compatibility (depends on T017)
- [x] T019 Run focused unit/type/build checks and fix failures
- [x] T020 Run extension e2e with full Chromium and inspect downloaded WebM
- [x] T021 Run `bun run verify`, `check:consistency`, `knip`, confirm no
      `packages/` diff, and inspect Safari CI converter output

## Phase 6: Review and delivery

- [x] T022 Run independent Codex diff review; address confirmed findings and
      repeat affected validation until no significant findings
- [x] T023 Update the project knowledge base with shipped recording lessons and
      task tag; refresh `wiki/index.md`
- [x] T024 Commit cohesive changes, push, create PR against `main`, wait for all
      required CI, fix failures, and merge

