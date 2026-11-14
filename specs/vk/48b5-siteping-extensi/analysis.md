# SpecKit analysis: extension screen recording

Analyzed `spec.md`, `technical-spec.md`, `clarifications.md`, `plan.md`,
`data-model.md`, contracts, tasks, and constitution version 0.7.0.

## Coverage

- Every acceptance item maps to one or more functional requirements and tasks.
- Ownership, start surface, no-audio policy, limit, browser support, captured
  UI, terminal states, quota behavior, deletion, exports, manifest precision,
  e2e automation, and documentation are resolved rather than left open.
- Both feedback deletion paths converge in the background handler and are
  explicitly covered by T009/T018.
- Binary data never uses runtime messages; `storage.local` remains the core
  feedback store; the new IndexedDB writer is named.
- Safari behavior is honest and testable: unsupported control, no Chrome-only
  permissions, converter/build retained.

## Constitution check

- No `packages/*` edit is planned (VIII).
- No network or host access is added; capture is explicit and local (IX).
- Background remains the feedback writer and offscreen is the recording writer
  (X). Direct review reads are allowed.
- Recording amendment invariants—bounded duration, no implicit audio, cascade
  delete, visible quota failure—each have requirements and tasks.

## Gaps found and resolved

1. **Shortcut ownership ambiguity:** clarified that it uses a still-valid
   remembered owner or the sole page feedback; otherwise it refuses visibly.
2. **Cross-store atomicity:** impossible across `storage.local` and IndexedDB;
   plan now uses owner revalidation, immediate hiding, and durable idempotent GC.
3. **Replacement loss:** old media remains until the replacement transaction
   commits.
4. **Worker restart:** offscreen owns capture and a persisted descriptor;
   startup reconciliation distinguishes live capture from interrupted failure.
5. **Poster failure:** video may still save; PDF falls back to the feedback
   screenshot while retaining duration/note.
6. **Manifest portability:** Chrome and Safari permission lists are separate
   explicit contracts rather than one template assumed to convert.

## Residual risks

- Exact headless Chromium tab-capture behavior must be proven early in T017;
  if the installed Chromium build cannot expose tabCapture under headless mode,
  CI needs headed Xvfb rather than a product-code fallback to display capture.
- A standard player check depends on an available media probe/player in the
  environment; browser replay plus container signature is the minimum automated
  contract, with ffprobe used when present.
- Safari runtime remains unverified by design and is stated as unsupported for
  recording.

No blocking contradiction, unresolved clarification, or constitution violation
remains. The task list is dependency ordered and implementation may begin.

