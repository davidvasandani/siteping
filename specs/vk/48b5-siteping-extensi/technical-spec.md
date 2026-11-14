# Technical spec: screen recording in the SitePing extension

Task: `vk/48b5-siteping-extensi`.

## Outcome

The Chrome extension can record the current tab for at most two minutes and
attach one recording to one existing feedback item. The review page plays,
downloads, and deletes that recording. Recordings stay in the extension
profile and never enter runtime messages, Slack requests, or PDFs. Safari
continues to build, but recording is explicitly unavailable there until the
capture path is implemented and exercised in Safari.

The existing screenshot flow remains unchanged. A feedback can have both its
annotated screenshot and one recording.

## Product decisions

1. **Ownership:** one recording belongs to one feedback id. Replacing a
   recording is explicit; deleting the feedback, including through the
   widget's panel or site-wide Delete all, deletes the video transactionally
   from the user's point of view. This keeps page, message, status, export
   selection, and deletion semantics together without changing
   `FeedbackRecord`.
2. **Start and attachment:** the popup gets a Record/Stop control and the
   manifest gets `Alt+Shift+R` as the recording shortcut. Recording requires
   SitePing to be enabled and at least one feedback on the current page. The
   reviewer chooses the target feedback in the popup before starting. This
   avoids a video with no durable owner and does not modify the widget. A
   feedback detail `panelActions` integration is deferred.
3. **Audio:** version one records video only. It requests neither microphone
   nor tab audio and adds no audio track.
4. **Limit:** the recorder stops at 2:00. The on-page indicator shows elapsed
   and remaining time, announces the limit before recording, and reports an
   automatic stop distinctly from a manual stop.
5. **Captured UI:** the recording includes the page exactly as the reviewer
   sees it, including SitePing's launcher, markers, open panels, and the red
   recording indicator. Screenshot capture keeps hiding SitePing chrome as it
   does today.

## Browser and capture decision

Chrome 116+ uses `chrome.tabCapture.getMediaStreamId()` from the background
after the popup click or command invocation. An offscreen document consumes
the id with `getUserMedia()` and records the video stream with
`MediaRecorder`. Chrome documents that, from Chrome 116, a stream id created
in the extension service worker can be consumed in an offscreen document in
the same extension origin/process, and that tab capture persists across page
navigations until the tab or stream closes. This matches the existing Chrome
minimum and gives navigation survival without a display picker.

The manifest adds exactly `tabCapture` and `offscreen`. Chrome's permission
list assigns neither an install warning. `activeTab`, the explicit popup
click/shortcut, and the existing no-host-access model remain. `getDisplayMedia`
is rejected for Chrome because it must show a picker on every start, cannot
constrain the user to the current tab, and ends with the captured page on
navigation in important browser configurations.

Safari receives the same review/storage UI for already stored data only if
the browser APIs exist, but the Record control is disabled with “Screen
recording is not available in Safari yet.” The Safari manifest must not carry
Chrome-only `tabCapture` or `offscreen` permissions. The converter warning is
reviewed after the manifest split. README wording distinguishes Chrome e2e
verification from Safari compile-only verification.

## Architecture and lifecycle

```text
popup / command          background (coordinator)       offscreen document
choose feedback + start -> obtain stream id ----------> MediaRecorder
                              |                              |
content-script overlay <------ recording state -------------+
review page             <----- metadata/status -------- IndexedDB blobs
```

Only the offscreen document writes the recording IndexedDB database, keeping
the constitution's one-writer rule. The background coordinates starts/stops,
validates the active tab and feedback owner, and broadcasts small JSON state.
The review page reads blobs and metadata directly from IndexedDB and sends
mutating requests to the background/offscreen writer.

### State machine

- `idle` -> `starting`: explicit Record click or recording command; validate
  Chrome support, enabled current tab, activeTab grant, target feedback, and
  no other active session.
- `starting` -> `recording`: offscreen document acquires the stream, starts
  `MediaRecorder`, and acknowledges. Only then does the content overlay say
  recording is active.
- `recording` -> `stopping`: explicit Stop, overlay Stop, 120-second timer,
  tab removal, capture track ending, navigation failure, or extension
  recovery.
- `stopping` -> `saved`: recorder emits its final data, IndexedDB commit
  succeeds, and metadata becomes visible. Then the active-session marker is
  cleared and the UI says saved.
- Any failure -> `failed`: stop tracks, discard incomplete chunks unless a
  valid finalized WebM blob was committed, clear the marker, and surface the
  reason. A quota/IndexedDB failure never changes or deletes feedback text.

At most one recording runs extension-wide because Chrome permits one
offscreen document per extension and a single obvious recording state is
safer. Starting another reports which tab is recording.

### Service-worker restart

The offscreen document owns the recorder, timer, chunks, and database write,
so a background service-worker restart does not interrupt active recording.
It keeps a compact active-session record in IndexedDB and answers a state
probe when the worker wakes. The background reconciles on startup and popup
open. If the offscreen document is gone while a session marker remains, the
worker marks the session failed and shows a clear “Recording ended before it
could be saved” result; it never claims a save or leaves a recording active.

Closing the popup does not stop recording. Closing the captured tab ends the
track and saves the finalized video when it contains data. Same-tab
navigation continues capture. Cross-origin navigation may turn SitePing's
annotation state off when `activeTab` ends, but Chrome tab capture continues;
the overlay is re-injected where permission permits, otherwise the browser's
capture indicator remains and the popup can stop the recording.

## Storage model

Database `siteping-recordings`, version 1, in the extension origin:

```ts
interface StoredRecording {
  feedbackId: string;       // key; one recording per feedback
  projectName: string;      // cascade/index validation
  pageUrl: string;          // page at start
  mimeType: string;         // negotiated MediaRecorder type
  byteLength: number;
  durationMs: number;
  createdAt: string;
  poster: Blob;             // JPEG still generated from the first usable frame
  video: Blob;              // WebM in Chrome
}
```

An `active` store contains the recoverable session descriptor, never media
chunks sent through `runtime.sendMessage`. Recording chunks remain in the
offscreen realm until finalization; a modest `timeslice` bounds renderer
memory bookkeeping while the 2-minute cap bounds total size. IndexedDB is
used because videos are multi-megabyte binary data and `storage.local` plus
JSON runtime messages are inappropriate.

Writes use one IndexedDB transaction for poster/video/metadata replacement.
The old recording is retained until the replacement commits. Delete by
feedback id and delete by project name are idempotent.

## Feedback deletion and consistency

The background handler changes both deletion paths:

- `feedback:delete`: delete the core feedback first, then request idempotent
  recording deletion before replying. If recording cleanup fails, retry from
  a small `recording-gc` key in `storage.local` on worker startup and report a
  cleanup warning; the review UI must never expose the orphan.
- `feedback:deleteAll`: snapshot the site's ids, delete core feedback, then
  delete recordings by project/id in one IndexedDB transaction and queue any
  failed cleanup.

The offscreen writer also checks that the feedback still exists immediately
before committing a completed recording. If it was deleted while recording,
the finalized blob is discarded and the reviewer is told why.

## Messages

Small JSON messages extend the existing protocol:

- `recording:start { tabId, feedbackId }`
- `recording:stop { reason: "manual" | "limit" }`
- `recording:state`
- `recording:delete { feedbackId }`

Content messages add `recording:show`, `recording:tick`, and
`recording:hide`. Offscreen messages carry commands, state, and errors only;
Blob data never crosses extension runtime messaging.

## User interface

The popup lists feedback for the current canonical page, newest first, with
enough message text to identify it. Record is disabled with an explanation
until SitePing is on and a feedback is selected. During recording it shows
elapsed/remaining time and Stop. The content script adds a fixed,
high-z-index, `data-siteping-ignore` recording pill with a red dot, elapsed
and remaining time, and Stop. It is keyboard reachable and removed on every
terminal state.

Each review card with a recording contains a poster, native video controls,
duration, Download video, and Delete recording. Object URLs are revoked on
rerender/unload. Download uses the negotiated extension (normally `.webm`)
and a sanitized deterministic filename. Deleting a recording leaves its
feedback and screenshot intact; deleting feedback retains the existing
confirmation but mentions that its recording is also deleted.

## Exports

The report model gains optional recording export metadata, separate from the
core record. PDF layout includes the poster still, duration, and “Screen
recording attached (video remains in SitePing)” for a selected feedback. If
poster generation failed but video saved, the PDF uses the feedback screenshot
as the still and still reports the recording. Slack and clipboard sections
append “Screen recording attached (kept on the reviewer's machine).” No Blob,
object URL, or video bytes enter either export.

Feedback without a recording follows the byte-for-byte-compatible logical
path and remains supported.

## Performance and failure behavior

- `MediaRecorder` uses the first supported choice among VP9 WebM, VP8 WebM,
  and browser default; no transcoding occurs.
- The stream has video only and a practical frame-rate constraint. UI timers
  update once per second.
- Review cards load poster images first and assign video object URLs only for
  records rendered on screen, avoiding base64 conversion and large DOM
  strings.
- Quota, recorder, track, and IndexedDB errors are user-visible and leave the
  feedback intact. Downloads stream from a Blob URL.

## Verification

- Unit tests cover the state machine, mime negotiation, 2-minute stop,
  restart reconciliation, quota failures, single-writer IndexedDB adapter,
  object URL cleanup, cascade delete, export metadata, and exact per-target
  manifests.
- Chromium e2e launches with fake media UI flags (including
  `--use-fake-ui-for-media-stream` and a tab-capture-compatible source),
  records a deterministic animated fixture without a human picker, stops,
  plays/downloads the WebM, restarts the persistent context, verifies replay,
  checks automatic stop with a test clock/short test limit, and verifies both
  deletion routes.
- Existing screenshot, PDF, Slack, and no-recording cases remain covered.
- Run `bun run verify`, `bun run check:consistency`, `bun run knip`, extension
  e2e, and `git diff --stat main -- packages/` (must be empty).
- CI's macOS converter output is inspected after the manifest change; Safari
  conversion/build must remain green and documentation must say recording is
  unavailable and runtime behavior remains unverified.

## Sources

- Chrome tab capture API: <https://developer.chrome.com/docs/extensions/reference/api/tabCapture>
- Chrome offscreen API: <https://developer.chrome.com/docs/extensions/reference/api/offscreen>
- Chrome permission list: <https://developer.chrome.com/docs/extensions/reference/permissions-list>
- `getDisplayMedia`: <https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia>

