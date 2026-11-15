# Prior knowledge: browser metadata in extension annotations

Task: `vk/64b1-add-browser-meta` / VAS-1030.

The project knowledge base is populated. Relevant pages and earlier shipped
specifications were read before planning.

## `wiki/browser-extension.md`

- `apps/extension` is a private, fork-only Manifest V3 application; published
  `packages/*` stay untouched to keep upstream merges cheap.
- Feedback uses the core `FeedbackRecord` and is stored one record per
  `storage.local` key. Reads tolerate old or malformed records, while the
  background context remains the only writer.
- The extension is local-first and performs no network activity except an
  explicit Slack webhook send. Any new annotation context should therefore be
  derived from data already stored rather than collected from another API.
- Unit tests use the extension fake API; the built Chrome and Safari manifests
  and outputs have exact tests.

Applied here: derive browser context at render/export time, do not migrate or
rewrite records, add no permissions or network calls, and keep all changes in
`apps/extension` plus task documentation.

## `wiki/pdf-without-a-library.md`

- PDF export is an intentionally small internal renderer with explicit text
  layout and WinAnsi/raster fallbacks, not a generic document library.
- Export behavior is driven through the `Report`/`ReportItem` view model and
  tested at both the model and rendered-PDF levels.

Applied here: add concise preformatted environment labels to `ReportItem` and
render them through the existing small-text row mechanism; do not parse the
user agent inside the PDF writer.

## `wiki/slack-webhook-export.md`

- Slack payloads and clipboard output are pure builders over the report model.
- User text is escaped and payload size limits are enforced; screenshots and
  recordings remain local.

Applied here: append short derived metadata to the existing context line and
keep the raw user-agent out of outbound content.

## Shipped extension specifications

`specs/vk/e5c0-siteping-chrome` establishes that each feedback already carries
the standard core fields, including `viewport` and `userAgent`, and that the
review page/PDF are the extension's annotation review surfaces. The newer
`specs/vk/48b5-siteping-extensi` preserves the same extension-only boundary and
joins recording sidecars into `ReportItem` at export time.

Applied here: reuse the existing stored fields and the established review-model
join pattern. No core schema, adapter contract, storage layout, or recording
database change is needed.

## `wiki/annotation-navigation.md`

Annotation navigation treats stored page identity as untrusted and validates
destinations before use. Although this task does not navigate, it reinforces
the rule that stored metadata is display input rather than trusted structure.
Unknown and malformed user-agent or viewport strings must produce safe labels,
not exceptions or executable markup.
