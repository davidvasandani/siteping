# Implementation plan: browser metadata in extension annotations

Task: `vk/64b1-add-browser-meta` / VAS-1030.

1. Confirm the current `FeedbackRecord` fields and every extension annotation
   presentation path: review card, report model, PDF, Slack, and clipboard.
2. Add a dependency-free pure formatter in `apps/extension/src/shared/` for
   browser/version, OS, device class, and normalized viewport labels.
3. Add table-driven formatter tests covering Chromium derivatives before
   Chrome/Safari fallbacks, desktop/mobile/tablet OS cases, synthetic and empty
   user agents, and malformed viewport strings.
4. Extend the report model with the derived metadata and update its unit tests,
   keeping the stored core record and serialized storage shape unchanged.
5. Render the labels on each review card using text-only DOM construction and
   existing metadata styles; add or extend review tests where the current test
   seam permits.
6. Render the same concise context in PDF cards and prove the extracted PDF
   content/model contains it without disturbing pagination.
7. Add the same context to Slack blocks and clipboard output, retaining escaping
   and Slack size constraints; extend both normal and edge-case tests.
8. Update extension documentation to state what environment metadata is shown
   and exported, including the privacy boundary (derived labels, not the raw UA).
9. Run focused extension tests, typecheck/build, then the repository verification,
   consistency, dead-code, extension e2e, and `packages/*` boundary checks.
10. Run an independent Codex diff review, address confirmed findings, and repeat
    affected validation until no significant finding remains.
11. Distill reusable UA-formatting/export lessons into the knowledge base and
    index with task tag `vk/64b1-add-browser-meta`.
12. Commit and push the cohesive SitePing change, open a Vibe Kanban PR against
    `main`, wait for all required CI to pass, and merge it.
