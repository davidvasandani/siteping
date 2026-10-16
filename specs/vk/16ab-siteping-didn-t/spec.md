# Feature specification: annotation page navigation

Status: specified. Command: /speckit.specify.

As a Teemay reviewer viewing feedback from another page, I want Go to annotation
to take me to that page and focus its annotation, so that a shared element selector
cannot misleadingly highlight an unrelated page.

## Requirements and acceptance criteria
- FR-1: Same-page actions reveal the live pin with existing scroll fallback.
- FR-2: With deep links enabled, a cross-page action navigates to the recorded
  same-origin HTTP(S) URL and carries the feedback ID under the configured parameter.
- FR-3: Unsafe or unsupported cross-page actions cannot highlight the current page.
- FR-4: Destination query parameters and fragments survive navigation.
- FR-5: Teemay receives a compatible immutable release, retaining its 0.10.10 contract.

Acceptance: tests demonstrate FR-1 through FR-4, including disabled/custom deep
links and invalid targets; Teemay build/tests and dependency integrity validate FR-5.

Out of scope: automatic identity/sandbox switching, changed authorization, arbitrary
cross-origin redirects, server schema changes, and hosting changes.

## Open questions
None; use existing deep-link configuration and page-scope identity as authorities.

## Clarification (/speckit.clarify)
User approved SitePing changes. Navigation uses a full document load, which invokes
the existing initial-load deep-link focus behavior. Deep links disabled means a
cross-page action is unavailable. A destination requiring a different identity is
subject to normal host authorization; the widget must never change identity.
No open questions remain.

Compatibility: `scopeAnnotationsByUrl: false` remains an explicit opt-out of page
isolation; its existing project-wide marker/reveal behavior is preserved. Teemay
uses the default scoped behavior.
