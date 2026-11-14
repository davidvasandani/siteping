# Clarifications: extension screen recording

Resolved on 2026-11-14 from the task's recommendations, repository
constraints, and official browser API documentation.

## Ownership and start flow

- A recording is a one-to-one sidecar of an existing feedback id, never a
  standalone site item and never a new `FeedbackRecord` field.
- The popup is the primary start surface. It lists feedback scoped to the
  current canonical page, and the reviewer chooses one before starting.
- The popup remembers the chosen feedback for that tab/page in session state.
  `Alt+Shift+R` stops an active recording; when idle it starts only if that
  remembered feedback still exists or exactly one current-page feedback
  exists. With zero or ambiguous candidates it does not record and gives a
  visible badge/popup instruction. This preserves explicit ownership without
  silently attaching video to the wrong item.
- Adding recording through widget `panelActions` is deferred; the widget is
  bundled unmodified.

## Capture and browser support

- Chrome uses `tabCapture` plus an offscreen document. `getDisplayMedia()` is
  not the Chrome fallback because its mandatory picker permits the wrong
  surface and weakens navigation behavior.
- Safari recording is unavailable in this version. Its popup states that
  plainly, while annotation, screenshot, review, and exports continue.
- Chrome capture contains SitePing UI and the indicator. This is intentional:
  the promise is “what the reviewer saw,” unlike the clean screenshot export.

## Media policy

- Video only, no audio tracks.
- Hard production limit: 120 seconds. Tests inject a shorter limit; production
  code and shipped UI always state two minutes.
- One active recording extension-wide and one saved recording per feedback.
  Starting a replacement requires confirmation; the old video survives until
  the replacement transaction commits.
- Output is the first supported WebM codec offered by Chrome (VP9, VP8, then
  default WebM). No transcoding or MP4 promise is made.

## Terminal states

- Manual Stop and the two-minute timer finalize and save.
- Same-tab navigation continues recording. If the content overlay cannot be
  re-injected, Chrome's own capture indicator plus popup Stop remains.
- Tab close or capture-track end finalizes and saves when non-empty; otherwise
  reports a failure.
- Popup close has no effect.
- Service-worker restart reconciles with the offscreen writer. If the writer
  disappeared, stale active state becomes a visible failed result, never a
  claim that video saved.
- Extension unload necessarily ends browser-owned capture; on the next load a
  stale marker is reported as an interrupted, unsaved recording.

## Deletion and failure

- Deleting only the recording keeps feedback. Deleting feedback or a whole
  site makes recording cleanup part of the same user operation.
- Because `storage.local` and IndexedDB cannot share an atomic transaction,
  failed media cleanup is hidden immediately and placed in an idempotent GC
  queue retried on startup. The user-visible invariant is no orphan recording.
- A recording commit verifies its owner still exists. Deleted owners cause the
  completed blob to be discarded.
- Quota failure leaves feedback and screenshot untouched and names the failed
  recording save.

## Exports

- PDF uses a generated poster frame; if unavailable it uses the feedback
  screenshot. It prints duration and a local-recording note.
- Slack and clipboard append a short local-recording note. No media bytes,
  Blob/object URL, or machine-local link is exported.

