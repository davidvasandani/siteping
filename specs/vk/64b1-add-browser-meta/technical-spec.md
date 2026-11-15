# Technical spec: browser metadata in extension annotations

Task: `vk/64b1-add-browser-meta` / VAS-1030.

## Problem

The SitePing extension already records the submitting page's `viewport` and
`userAgent` on every `FeedbackRecord`, but its annotation review surfaces show
only the raw viewport. A reviewer therefore cannot quickly tell which browser,
operating system, or device class was involved, even though that context is
often essential to reproduce a visual defect.

## Scope

Add a small extension-only presentation layer that turns the stored user-agent
and viewport values into useful, stable labels and shows them with each
annotation. The metadata must appear in the extension review card and in both
portable textual exports (PDF and Slack/clipboard), so context is not lost when
an annotation leaves the review page.

The first version will expose:

- browser family and meaningful major version when it can be identified;
- operating-system family when it can be identified;
- device class (`Mobile`, `Tablet`, `Desktop`, or `Unknown device`) inferred
  conservatively;
- the existing viewport, normalized typographically as `width×height`.

Unknown or synthetic user agents must degrade to `Unknown browser` without
throwing. Missing or malformed optional values must not make a stored feedback
record unreadable.

## Architecture

Create a pure metadata formatter under `apps/extension/src/shared/`. It accepts
the two values already present on `FeedbackRecord` and returns a display model;
it does not mutate records, add storage keys, inspect live browser globals, or
send data anywhere. Detection uses ordered token matching because Chromium
derivatives contain the Chrome and Safari compatibility tokens; Edge, Opera,
Samsung Internet, Firefox/iOS, Chrome/iOS, and Safari/iOS must be checked before
generic Chrome or Safari.

The extension review UI consumes that display model rather than printing the
raw viewport alone. `ReportItem` carries the same derived strings so the PDF
renderer and Slack/clipboard builder remain deterministic functions of their
input. No change is made to published `packages/*` APIs or to the persisted
`FeedbackRecord` wire shape.

## Compatibility and privacy

- Existing records are enriched at display time and need no migration.
- Chrome and Safari extension builds use identical parsing code.
- The raw user-agent remains local, exactly as today. Exports include concise
  derived labels, not the full raw user-agent string.
- No dependency is added: the supported label set is small, and a full UA
  parser would add bundle and maintenance cost beyond the requirement.

## Verification

Add table-driven tests for browser ordering, operating systems, mobile/tablet
classification, unknown/malformed inputs, and viewport normalization. Extend
review/report/PDF/Slack tests to prove each output includes the metadata and
that existing records still render. Run the extension test suite, typecheck,
build, repository verification/consistency checks, and the package-boundary
check required by the extension constitution.

## Non-goals

- Changing how the widget captures `userAgent` or `viewport`.
- Browser fingerprinting, exact device-model detection, client hints, or live
  feature detection.
- Altering the hosted dashboard or any published SitePing package.
