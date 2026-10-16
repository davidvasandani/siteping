# Validation

- `bun run verify`: build, check, lint and 4,348 tests passed (135 files, no type errors).
- `bun run check:consistency`: passed.
- Chromium 149 / Playwright: `e2e/annotation-navigation.spec.ts` passed against the built IIFE; navigated from Sandbox to talent and focused the destination annotation.
- Widget size gate: ESM 34.79/36 kB, IIFE 137.18/138 kB gzip.
- `codex review --uncommitted`: no actionable regressions identified.

Backport and Teemay release consumption follow in the delivery stage.
