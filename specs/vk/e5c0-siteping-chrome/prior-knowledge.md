# Prior knowledge: vk/e5c0-siteping-chrome

Read-only recall over the project knowledge base (`wiki/`, three pages) for
extension, PDF, Slack, screenshot, storage, Safari, Playwright and fork
maintenance. Nothing in it covers a browser extension, PDF generation or
Slack; this task is the first in those areas. What does carry over:

## From `wiki/fork-releases.md` (vk/9d5e-make-our-sitepin)

- The fork cannot publish under the `@siteping` npm scope. Fork builds ship as
  assets on immutable GitHub releases; a release is never replaced, a fix gets
  the next number.
- `release.yml` (release-please, npm) runs only upstream. Fork-only workflows
  guard themselves with `github.repository_owner != 'NeosiaNexus'`.
- `main` stays a clean merge of upstream: nothing is committed back by release
  automation.

Applied here: the extension is a private app that is never published to npm,
its workflow carries the same fork guard, and nothing in `packages/*` is
edited, so upstream syncs keep merging cleanly.

## From `wiki/widget-host-scrolling.md` (vk/57e4-fix-go-to-annota)

- The marker layer `#siteping-markers` sits on `<body>` outside the shadow
  host. Widget chrome therefore lives in three places: the `<siteping-widget>`
  host, elements carrying `data-siteping-ignore="true"`, and the marker layer.
- Feedback `url` must equal the page scope URL or no marker renders.
- jsdom has no layout; geometry needs stubs. Real-browser evidence comes from
  Playwright against a built bundle.
- On NixOS the Chromium that Playwright downloads lacks libraries. Use
  `nix build nixpkgs#chromium` and pass `executablePath`.
- The widget IIFE size budget is tight and CI measures about 0.6 kB more than a
  local NixOS build.

Applied here: the viewport capture hides all three chrome locations before
`captureVisibleTab`; the extension's page scope and stored `url` use one
function; the extension e2e takes a Chromium path from the environment; and
the extension bundles the widget from source instead of touching the widget
package, so the widget's size budget is unaffected.

## From `wiki/annotation-navigation.md` (vk/16ab-siteping-didn-t)

- Anchors belong to the page they were recorded on. A shared selector resolves
  on the wrong page, so markers and reveal are scoped by `getScope().url`.
- With `deepLink` on, a cross-page "Go to annotation" loads the recorded page
  with the feedback id in a query parameter; without it the action is hidden.
- `annotationDestination` only allows same-origin HTTP(S) targets.

Applied here: the extension keeps the default `scopeAnnotationsByUrl`, and its
review page opens a feedback's page with the deep-link parameter. Because the
page scope includes the query string, the deep-link parameter must be removed
from the scope URL or a deep-linked page would stop matching its own feedback.

## From the constitution (`.specify/memory/constitution.md`, 0.5.0)

- Justify non-obvious solutions in the spec; define acceptance before
  implementing; smallest change that delivers value.
- New dependencies are recorded with their reason in the research notes.
- Principle VII (bundled executable entries) and the widget navigation
  amendment both ask that third-party code a user runs is pinned and its
  provenance stated.

Applied here: the screenshot module swap is justified in the technical spec;
runtime dependencies stay at zero beyond the workspace's own widget and core;
`pdfjs-dist` is a test-only dependency, recorded in research.

## Gaps this task will have to fill

No page yet on: running the widget in a content script's isolated world,
the store-over-messaging pattern, generating a PDF without a library, Slack
webhook limits, or packaging for Safari. These are candidates for stage 12.
