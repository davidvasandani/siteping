# Implementation Plan: SitePing extension screen recording

**Spec**: `./spec.md`
**Status**: Ready

## Technical Context

TypeScript/Bun/esbuild Manifest V3 extension in `apps/extension`; Chrome 116+
service worker and target-specific Safari background build. Feedback uses
`storage.local`; recordings use IndexedDB Blob values. Chrome capture uses
`tabCapture`, an offscreen document, `MediaRecorder`, and video-only
`getUserMedia`. No runtime dependency or `packages/*` change is planned.

## Architecture & Approach

- `src/recording/model.ts`: state, metadata, duration, mime, and filename
  helpers with runtime validation.
- `src/recording/database.ts`: versioned IndexedDB reads and the mutation API
  used only by the offscreen document. Review UI may read directly.
- `src/recording/recorder.ts`: MediaRecorder lifecycle, time limit, poster
  generation, and exactly-once finalization.
- `src/offscreen/offscreen.html|ts`: the sole recording database writer and
  owner of active capture state.
- `src/background/recording.ts`: active-tab/feedback validation, stream-id
  acquisition, offscreen lifecycle, restart reconciliation, state broadcast,
  and GC retry. Existing `handler.ts` calls it for cascade deletion.
- `src/content/recording-indicator.ts`: accessible on-page state and Stop.
- `src/ui/popup.*`: owner selection and Record/Stop. `src/ui/review.*`:
  playback, download, and removal with object-URL cleanup.
- `src/shared/report.ts`, `src/pdf/report.ts`, and `src/slack/message.ts` accept
  optional recording export metadata without changing core records.
- `scripts/build.mjs` emits an offscreen entry for Chrome and target-specific
  permissions. Safari renders the unsupported state.

## Data Model

See `./data-model.md`. One recording record is keyed by feedback id and holds
binary video/poster Blobs plus metadata. A separate singleton active-session
record supports worker reconciliation. A small `storage.local` GC queue bridges
non-atomic feedback/IndexedDB deletion.

## Contracts

See `./contracts/messages.md`, `./contracts/manifest.md`, and
`./contracts/recording-storage.md`.

## Research Notes

See `./research.md`. The design relies only on browser APIs already available
at the Chrome 116 minimum and adds no package dependency.

## Constitution Check

- I–III: explicit state machine and bounded one-recording feature; testable
  contracts precede code.
- VIII: no `packages/*` edits; all data and UI are extension-side.
- IX: explicit click, current-tab video only, no audio/network/upload; exact
  per-target permissions tested.
- X: feedback writes remain background-only; recording IndexedDB writes are
  offscreen-only. Cross-store cleanup is idempotent and retried.
- Recording amendment: 120-second cap, visible terminal errors, cascade delete,
  and feedback preservation on quota failure are designed and tested.
- Principles IV–VII are not implicated.

No deviation is required.

## Risks & Dependencies

- Headless extension tab capture can differ by Chromium build. Mitigate with
  official fake-media flags, a deterministic fixture, and CI using the same
  full Chromium binary as the existing extension suite.
- IndexedDB is not shared transactionally with `storage.local`. Mitigate with
  owner revalidation, hidden-orphan semantics, and a durable idempotent GC
  queue.
- Service workers can restart mid-session. The offscreen document owns media
  state and persists a descriptor; coordinator startup reconciles it.
- Browser codec support varies. Negotiate VP9/VP8/default WebM and store the
  actual MIME type; do not transcode.
- Safari cannot use Chrome's capture path. Keep its manifest clean, control
  disabled, docs explicit, converter warnings checked.

