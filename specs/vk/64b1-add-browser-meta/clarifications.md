# Clarifications: browser metadata in extension annotations

Resolved on 2026-11-15 from the issue wording, existing extension behavior, and
the project constitution.

- “Annotation” covers the extension's review card and the explicit exports
  derived from it. All four labels (browser, OS, device, viewport) remain
  consistent across those surfaces.
- The browser version is the major version only. Patch-level values add noise
  and can increase fingerprinting detail without materially improving common
  visual-regression triage.
- The raw `userAgent` remains stored as part of the existing core record but is
  never shown or exported by this feature.
- Unknown values use honest fallbacks rather than guessing. A device defaults
  to Desktop only when desktop platform evidence exists; otherwise it is
  `Unknown device`.
- No new capture, permission, network, or storage behavior is introduced.
