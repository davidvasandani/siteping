# Prior knowledge — vk/16ab-siteping-didn-t

Read-only recall searched SitePing `wiki/` and Teemay `knowledge-base/` for annotation, scrolling, page scope and SitePing integration.

- `siteping/wiki/widget-host-scrolling.md`: shared main anchors and inner scroll containers require live-pin scrolling; preserve the existing scroll helper. jsdom needs layout stubs; real browser evidence matters.
- `siteping/wiki/fork-releases.md`: fork fixes reach consumers through immutable GitHub tarballs, never the upstream npm scope. Releases are tagged by package base version; consumers pin URL and integrity.
- `teemay/knowledge-base/hosting-a-third-party-client-contract.md`: Teemay uses native Rust HTTP handlers and widget 0.10.10-fork.1. Do not upgrade to 0.11's changed server contract. Backport the widget fix and update the exact release pin and provenance.

Current inspection: SitePing main hides cross-page annotation actions, while Teemay consumes an older fork. Investigate that release before choosing the implementation base. A navigation fix must retain existing same-page scrolling behavior and use Teemay's pathname page scope.
