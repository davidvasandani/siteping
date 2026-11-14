# Research: SitePing extension screen recording

## R1 — Capture mechanism

**Decision:** Chrome `tabCapture.getMediaStreamId()` in the service worker,
consumed by video-only `getUserMedia()` in an offscreen document.

Chrome documents that a stream id created in a service worker can be consumed
in an offscreen document beginning in Chrome 116, the extension's existing
minimum. Tab capture is maintained across page navigations until the tab or
stream closes. It requires an extension invocation and the `tabCapture`
permission; targeting a tab also requires its `activeTab` grant.

**Rejected:** `getDisplayMedia()`. It requires transient activation and a
surface picker on every call, and the application cannot limit the offered
choices to the current tab. That conflicts with current-tab-only behavior and
adds avoidable reviewer friction.

Sources: Chrome tabCapture/offscreen docs and MDN getDisplayMedia, linked in
`technical-spec.md`.

## R2 — Permissions

**Decision:** add `tabCapture` and `offscreen` to Chrome only. Chrome's official
permission list shows no warning string for either. Keep `activeTab`,
`scripting`, `storage`, and `unlimitedStorage`; add no host permission.

Safari omits both Chrome-only permissions. Exact manifests remain unit-tested.

## R3 — Storage

**Decision:** IndexedDB with Blob values, one offscreen writer. `storage.local`
is JSON-oriented and existing runtime calls deliberately round-trip JSON;
base64 video would inflate storage/memory and large messages are unsafe.

**Rejected:** File System Access (not extension-portable and permission/UI
cost), OPFS (unneeded complexity), `storage.local` chunks (JSON/base64 and
cleanup complexity).

## R4 — Media format

**Decision:** negotiate `video/webm;codecs=vp9`, then VP8, then `video/webm`.
Chrome/MediaRecorder emits a standard WebM Blob without CPU-heavy transcoding.
Store actual MIME and derive `.webm` download names.

## R5 — Limits and memory

**Decision:** 120 seconds, video only, one session extension-wide, MediaRecorder
timeslices, no transcoding. This bounds disk and memory while preserving enough
time for a multi-step reproduction.

## R6 — E2E automation

Use Chromium's `--use-fake-ui-for-media-stream` together with the existing
persistent extension context and manifest access stand-in. Because tabCapture
does not show the getDisplayMedia picker, test starts remain userless after the
extension command is invoked through its popup test page. Validate real frames
from a changing fixture rather than only Blob existence.

## Dependencies

No new npm dependency. Production uses IndexedDB, MediaRecorder, canvas/video,
tabCapture, and offscreen browser APIs. Tests use existing Vitest and
Playwright infrastructure with local fakes.

