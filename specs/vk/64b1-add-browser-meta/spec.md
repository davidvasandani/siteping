# Feature Specification: Browser metadata in extension annotations

**Feature dir**: `specs/vk/64b1-add-browser-meta/`
**Status**: Clarified

## Summary

Show useful browser environment context with every annotation created by the
SitePing browser extension. Reviewers should be able to see and export the
browser, operating system, device class, and viewport needed to reproduce a
reported visual problem, without exposing the full raw user-agent string.

## User Stories

- As a reviewer, I want an annotation to name the browser environment in which
  it was created so that I can reproduce browser-specific defects.
- As a teammate reading a PDF or Slack export, I want the same environment
  context as the in-extension review so that I do not need access to the
  reviewer's extension storage.
- As a privacy-conscious reviewer, I want only concise derived labels exported
  rather than the full identifying user-agent string.

## Functional Requirements

- FR-1: Each extension annotation review card shows its browser family and the
  browser's major version when the stored value identifies one.
- FR-2: Each card shows an operating-system family when it can be identified.
- FR-3: Each card shows a conservative device class: Desktop, Tablet, or Mobile.
- FR-4: Each card shows the annotation's viewport as `width×height` when the
  stored value contains a valid positive width and height.
- FR-5: Browser identification distinguishes common Chromium and iOS variants
  rather than mislabelling all compatible user agents as Chrome or Safari.
- FR-6: Unknown, empty, synthetic, or malformed environment values produce safe
  fallback labels and never prevent an otherwise readable annotation from
  appearing.
- FR-7: PDF exports include the same browser, OS, device, and viewport context
  for each selected annotation.
- FR-8: Slack sends and clipboard exports include the same concise context for
  each selected annotation.
- FR-9: The extension does not export the complete raw user-agent string.
- FR-10: Existing stored annotations gain the labels without a migration or
  rewrite.
- FR-11: The feature adds no permission, network call, or external dependency.
- FR-12: Published SitePing packages and their public contracts are unchanged.

## Out of Scope

- Exact hardware/device model detection, browser fingerprinting, or client hints.
- Changing the fields captured by the widget or the core feedback wire contract.
- Adding metadata to the hosted SitePing dashboard.
- Filtering or grouping feedback by environment.
- Translating the new extension labels.

## Acceptance Criteria

- [ ] A Chrome/Windows annotation card and its PDF/Slack/clipboard exports name
      Chrome's major version, Windows, Desktop, and the normalized viewport.
- [ ] Edge is identified as Edge rather than Chrome; Opera and Samsung Internet
      likewise retain their own family names.
- [ ] Chrome, Firefox, and Edge iOS compatibility tokens are identified before
      the Safari fallback.
- [ ] iPhone, iPad (including desktop-mode iPad), Android phone, Android tablet,
      macOS, Windows, Linux, and ChromeOS inputs produce the intended OS/device
      labels in table-driven tests.
- [ ] An empty or unfamiliar user agent yields `Unknown browser` and does not
      hide or break the annotation.
- [ ] No export contains the original raw user-agent string.
- [ ] Existing extension tests, typecheck/build, both target builds, and package
      boundary checks pass with no `packages/*` source change.

## Open Questions

None. Browser, OS, device class, and viewport appear consistently in the review
card, PDF, Slack, and clipboard outputs. Consistency is more useful for remote
reproduction than saving the few characters occupied by device class.
