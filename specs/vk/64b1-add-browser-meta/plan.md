# Implementation Plan: Browser metadata in extension annotations

**Spec**: `./spec.md`
**Status**: Ready

## Technical Context

TypeScript 5.9, Bun/Vitest, esbuild, and a Manifest V3 extension under
`apps/extension`. Feedback is the existing `@siteping/core` `FeedbackRecord`,
which already contains `userAgent` and `viewport`. The review DOM, report view
model, custom PDF renderer, and Slack/clipboard builders are extension-only.

## Architecture & Approach

Add `apps/extension/src/shared/environment.ts`, a pure formatter from stored
strings to an immutable `EnvironmentMetadata` display model. Ordered regular
expressions identify specific compatibility tokens before generic engines;
platform and mobile tokens derive OS and device class independently. Viewport
parsing accepts only positive integer `width x height` values, with whitespace
and either `x`, `X`, or `×` separators, and otherwise reports an unknown value.

`toReport` derives the model exactly once per record and stores concise labels
on `ReportItem`. `ui/review.ts` calls the same formatter directly because it
renders the core record rather than a report. `pdf/report.ts` and
`slack/message.ts` consume only `ReportItem.environment`, preserving their pure
view/render roles. No storage migration or live global inspection occurs.

Files:

- new formatter/test: `apps/extension/src/shared/environment.ts`,
  `apps/extension/__tests__/environment.test.ts`;
- model: `apps/extension/src/shared/report.ts` and model tests;
- surfaces: `apps/extension/src/ui/review.ts`,
  `apps/extension/src/pdf/report.ts`, `apps/extension/src/slack/message.ts` and
  their existing tests;
- docs: `apps/extension/README.md`, `wiki/browser-extension.md`, `wiki/index.md`.

## Data Model

See `./data-model.md`. There is no persisted-model change.

## Contracts

See `./contracts/environment-metadata.md` for label and fallback behavior.

## Research Notes

See `./research.md`. No dependency is added.

## Constitution Check

- I–III: one small pure module, explicit fallbacks, contract tests first.
- VIII: only `apps/extension`, specifications, and wiki change; no published
  package source is edited.
- IX: derivation is local, adds no permission/network call, and exports concise
  labels rather than the raw user agent.
- X: no storage write is added.
- Environment-metadata amendment: every review/export surface uses one formatter
  and tolerates malformed inputs.

No deviation exists.

## Risks & Dependencies

- UA strings are not a formal browser-detection API. The feature makes only
  conservative family/major claims and has honest unknown fallbacks.
- Compatibility-token ordering is easy to regress. Table-driven tests pin each
  supported family and iOS alias.
- Added PDF text can affect pagination. Render tests cover content and the
  existing large-report timing/pagination suite remains in the gate.
- Slack sections have a hard 3000-character limit. The environment line is part
  of the progressively rebuilt/cut section and limit tests remain mandatory.
