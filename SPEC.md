# Technical spec: navigate to the annotation's page

Task: vk/16ab-siteping-didn-t (workspace 16ab3036-a17a-48a6-b793-b9141b197c22).

The report shows feedback recorded on `/talent/...` highlighted against the Sandbox page's shared `#main` anchor. “Go to annotation” must locate the feedback on its own page, never apply an unrelated page's anchor or scroll coordinates.

Scope: SitePing widget navigation and regression coverage; Teemay integration only if needed. SitePing changes were explicitly approved. No hosting or unrelated service changes.

Requirements:
- Same-page feedback retains live-pin reveal and stored-offset fallback.
- Cross-page feedback navigates to its recorded URL with the existing feedback deep-link mechanism, where supported, before locating its annotation.
- URL comparison respects the host's configured page scope; relative paths work for Teemay.
- Reject unsafe navigation targets; preserve destination query/fragment behavior under existing deep-link conventions.
- Preserve permissions and prevent cross-page markers on the current document.
- Define and test unsupported navigation behavior instead of highlighting the wrong document.

Validation: regression tests for cross-page and same-page actions, page scoping, deep-link restoration, malformed/unsafe URLs; repository verification and independent Codex review. Release consumption by Teemay must use an immutable artifact if an integration update is necessary.
