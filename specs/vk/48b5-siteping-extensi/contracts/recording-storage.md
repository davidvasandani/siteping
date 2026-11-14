# Contract: recording storage

- Database name `siteping-recordings`, schema version 1.
- `recordings` key path `feedbackId`, non-unique index `projectName`.
- `sessions` key path `id`, only `active` is valid.
- A saved recording transaction writes complete metadata, non-empty video Blob,
  and optional JPEG poster atomically.
- Read APIs skip malformed values without deleting them.
- Mutation APIs are invoked only in the offscreen document.
- `delete(feedbackId)` and `deleteProject(projectName)` are idempotent.
- No result returns video/poster through extension runtime messaging. Review
  reads directly and creates/revokes local object URLs.
- A completion commit first confirms the core feedback owner still exists; a
  missing owner discards the media.

