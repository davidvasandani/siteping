# Implementation plan: extension screen recording

Task: `vk/48b5-siteping-extensi`.

1. **Define contracts and browser port.** Add recording state, metadata, and
   request/reply types to `src/shared/messages.ts`; extend the typed Chrome API
   surface for tab capture, offscreen documents, runtime contexts, and target
   detection. Update fakes and protocol tests first.
2. **Build the IndexedDB recording store.** Add `src/recording/database.ts`
   with versioned stores for videos and an active-session descriptor. Expose
   read/list helpers for extension pages and mutation helpers only to the
   offscreen writer. Test persistence, replacement, project/id deletion,
   transaction failure, quota errors, and stale-session recovery with a small
   in-memory IDB test seam.
3. **Implement recorder primitives.** Add mime negotiation, duration/filename
   formatting, poster extraction, and a recorder state machine under
   `src/recording/`. Keep the 120-second policy injectable for tests. Cover
   manual stop, time limit, track end, zero-byte result, quota failure, and
   exactly-once finalization.
4. **Add the offscreen writer.** Create `src/offscreen/offscreen.html|ts`.
   Consume a `tabCapture` stream id with video-only `getUserMedia`, own the
   `MediaRecorder`, timer, chunks, poster/video IndexedDB transaction, and
   active-session marker. Handle control messages and state probes without
   sending media through runtime messaging.
5. **Add background coordination.** Create a recording coordinator that
   validates the target tab and feedback, ensures the offscreen document,
   obtains the stream id only from a user-invoked path, forwards start/stop,
   reconciles worker restarts, and broadcasts state. Wire it through
   `background/index.ts` and `handler.ts`.
6. **Cascade feedback deletion.** Wrap both `feedback:delete` and
   `feedback:deleteAll` so recording cleanup follows core-store deletion.
   Persist idempotent GC work when IndexedDB cleanup fails and retry it during
   startup. Test widget-panel and review-page routes through the common
   handler, including delete-all and deleting during recording.
7. **Add recording presence UI.** Extend the content controller with a fixed,
   accessible recording pill showing elapsed/remaining time and Stop. It is
   included in capture, updates once per second, survives reinjection by state
   reconciliation, and disappears on all terminal states.
8. **Extend the popup.** Add feedback selection for the canonical current
   page, a two-minute explanation, Record/Stop control, live timer, unsupported
   Safari copy, and errors. Add `Alt+Shift+R`; make the command start only when
   an unambiguous remembered/sole target exists, otherwise open/direct the
   reviewer to the popup rather than guessing.
9. **Extend the review page.** Join IndexedDB metadata to feedback cards and
   render poster, native playback, duration, Download, and Delete recording.
   Revoke Blob URLs on redraw/unload and keep UI responsive by lazy attachment.
   Update confirmations and live refresh behavior.
10. **Extend export models.** Add optional recording poster/duration metadata
    to the extension-side report model. Render poster/duration/local-only note
    in PDF and append the recording sentence to Slack and clipboard output.
    Preserve all no-recording cases.
11. **Split manifests and build outputs.** Chrome permissions become exactly
    `activeTab`, `scripting`, `storage`, `unlimitedStorage`, `tabCapture`, and
    `offscreen`, with the recording command and bundled offscreen files.
    Safari omits Chrome-only permissions, keeps conversion green, and exposes
    recording as unavailable. Update exact build tests.
12. **Document support and privacy.** Update the extension README and wiki with
    ownership, two-minute limit, no audio, IndexedDB storage, local-only
    behavior, Chrome verification, Safari unsupported status, permissions, and
    restart/navigation/close semantics.
13. **Automate the browser flow.** Add a deterministic animated fixture and
    Chromium launch flags that allow capture without a human. E2e start/stop,
    playback, standard-player WebM download, persistent-context restart,
    automatic limit, quota-visible failure where feasible, and both cascade
    deletion paths.
14. **Validate incrementally.** Run focused Vitest suites after each layer,
    then build/typecheck, extension e2e, `bun run verify`,
    `bun run check:consistency`, `bun run knip`, and confirm
    `git diff --stat main -- packages/` is empty. Inspect the Safari converter
    warnings from CI.
15. **Review, knowledge, and delivery.** Run an independent Codex diff review,
    fix confirmed findings and repeat validation. Update the browser-extension
    knowledge page/index with reusable recording lessons, commit, push, open a
    PR, wait for required CI, and merge it.

