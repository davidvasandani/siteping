# Prior knowledge: SitePing extension screen recording

Task: `vk/48b5-siteping-extensi`.

The project knowledge base is populated. The relevant pages are
`wiki/browser-extension.md`, `wiki/pdf-without-a-library.md`, and
`wiki/slack-webhook-export.md`, plus the shipped extension specification at
`specs/vk/e5c0-siteping-chrome/`.

## Extension architecture to preserve

- The background is the sole writer for feedback and settings. Other contexts
  may read directly when values are too large for runtime messages. Screen
  recording should retain this shape: one offscreen writer for IndexedDB
  video, with JSON-only control messages.
- Feedback is stored one key per id in `storage.local`; screenshots are data
  URLs. That layout is intentionally unsuitable for multi-megabyte Blob
  video, confirming the new IndexedDB sidecar keyed by feedback id.
- The extension installs with no site access. `activeTab` comes from a toolbar
  or shortcut invocation, and the shipped manifest is asserted exactly in
  `apps/extension/__tests__/build.test.ts`.
- Same-origin navigation is re-injected; cross-origin navigation can end the
  annotation grant. The widget lives in an isolated content-script world and
  needs background forwarding for navigation events.
- The Chrome e2e copies the build, substitutes `<all_urls>` for the otherwise
  unautomatable toolbar grant, opens the popup with `?tabId=`, and uses a
  persistent Chromium context. The shipped manifest remains a separate unit
  assertion.
- Safari conversion and unsigned Xcode compilation prove packaging only. The
  converter's warnings are an important compatibility signal, and README
  claims must not imply runtime verification.

## Screenshot behavior that must not regress

- Screenshot capture deliberately hides SitePing chrome using opacity plus
  disabled transitions, waits two animation frames, captures the visible tab,
  crops with `createImageBitmap`, and restores UI in `finally`.
- Recording is a different promise: it should show the page as the reviewer
  saw it, including SitePing controls and the recording indicator. Do not
  reuse the screenshot hiding seam for video.
- `tabs.captureVisibleTab` depends on `activeTab` or `<all_urls>` and is kept
  as-is. Adding recording must not alter screenshot capture permissions or its
  fallback.

## Review page and exports

- The review page redraws on `storage.onChanged`; running operations are
  tracked so redraw does not accidentally re-enable an in-flight action.
  Video object URLs need the same redraw discipline and explicit revocation.
- Export builders consume a report model rather than reading storage. Join
  recording metadata/posters into the report before PDF and Slack generation
  instead of teaching those modules about IndexedDB.
- The PDF writer embeds JPEG bytes directly and lays out cards as rows. A
  recording poster can use the existing JPEG/image path; duration and the
  local-only note are ordinary report rows.
- Slack Incoming Webhooks cannot upload files. Payload limits are checked
  after escaping, and user text is mention-proofed. Recording adds a short
  local-only sentence to each affected feedback section, never a link or
  object URL.

## Repository and constitution implications

- `packages/*` is upstream-facing and must remain untouched. All video state
  is extension-side and keyed by core feedback id.
- Permission minimization is enforced in the spec and exact build tests.
  Chrome recording may add `tabCapture` and `offscreen`; Safari needs a
  target-specific manifest without unsupported Chrome permissions.
- The prior task documents a one-writer requirement because store queues are
  per realm. A single offscreen document should own recording database
  mutations, while the background owns orchestration and feedback mutation.
- Known local validation exception: the unrelated Prisma SQLite conformance
  test may lack a NixOS engine, but all extension-specific tests and CI gates
  still need to pass.

## New research applied to this task

Chrome's official API documentation says a tab-capture stream id created in
a service worker can be consumed in an offscreen document from Chrome 116,
and that capture survives page navigation until the tab or stream closes.
Chrome's permission list gives neither `tabCapture` nor `offscreen` an install
warning. MDN confirms `getDisplayMedia()` always prompts the user to select a
surface and requires transient user activation. These facts favor the
Chrome-specific tab-capture/offscreen design and an explicit unsupported
state in Safari over a weaker cross-browser picker flow.

