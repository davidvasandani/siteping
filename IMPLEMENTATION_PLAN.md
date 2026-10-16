# Implementation plan

1. Add a small safe destination helper using the existing deep-link parameter, allowing same-origin HTTP(S) destinations only.
2. Wire panel annotation actions to navigate across pages when deep links are enabled; guard wrong-page highlighting even if invoked directly. Preserve same-page scrolling.
3. Cover navigation, unsafe targets, disabled/custom deep links and same-page reveal with widget regression tests; run repository verification.
4. Independently review the diff using Codex CLI and address findings.
5. Record the page-identity rule in the wiki and commit.
6. Open and merge the main fix PR. Backport the compatible fix onto `fork/widget-0.10.x`, verify/review and merge its PR; publish an immutable fork release.
7. Update Teemay's widget URL, lockfile and provenance to that release; verify and independently review, record knowledge, open and merge its PR.

No new dependencies, server contract changes or hosting changes. Preserve prior inner-scroller behavior. Unsupported/unsafe destinations must not apply anchors to the current document.
