# Tasks (/speckit.tasks)

## Implementation
- [x] T001 Implement safe destination helper in `packages/widget/src/annotation-navigation.ts`.
- [x] T002 Wire `packages/widget/src/launcher.ts` and `packages/widget/src/panel.ts` (depends T001).
- [x] T003 Add helper and panel interaction regression coverage under `packages/widget/__tests__/` and `e2e/annotation-navigation.spec.ts`; document navigation in `apps/demo/content/docs/widget/configuration{,.fr}.mdx` (depends T002).
- [x] T004 Run verification and fix confirmed failures (depends T003).

## Review and delivery
- [x] T005 Independent Codex review, resolve findings (depends T004).
- [x] T006 Record reusable knowledge in `wiki/annotation-navigation.md` and `wiki/index.md`; commit (depends T005).
- [ ] T007 Merge main PR; backport implementation/tests to `fork/widget-0.10.x`, verify/review and merge backport PR (depends T006).
- [ ] T008 Publish immutable backport tarball; update Teemay `web/package.json`, `web/package-lock.json`, `PROVENANCE.md`; verify/review and record knowledge (depends T007).
- [ ] T009 Open and merge Teemay PR (depends T008).

No independent implementation layers: tests exercise the panel wiring, release
consumption depends on publication, and each review must cover the final diff.
