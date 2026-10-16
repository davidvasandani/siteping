# Research

Main currently hides cross-page actions, but 0.10.10-fork.1 unconditionally resolves
anchors in the current document. Launcher already supports an initial-load
`siteping` query parameter (customizable). Reuse it with a document navigation;
no new router API is required. Restrict destinations to the current origin rather
than trusting feedback URLs. Teemay uses a Rust port of the older HTTP contract,
so releasing a backport avoids an unrelated server upgrade.
