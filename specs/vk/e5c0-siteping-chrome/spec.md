# Feature Specification: SitePing browser extension (Chrome and Safari)

**Feature dir**: `specs/vk/e5c0-siteping-chrome/`
**Status**: Clarified

## Summary

SitePing today needs a developer to embed the widget in a site and, for
anything beyond a demo, to run a server. This feature makes SitePing usable by
anyone on any website: a browser extension for Chrome and Safari that a
reviewer switches on for the page in front of them, annotates with the same
SitePing experience, and keeps entirely on their own machine. A review leaves
the machine only when the reviewer exports it, as a PDF file to hand to a
client or developer, or as a message in Slack.

## User Stories

- As a reviewer, I want to switch SitePing on for the page I am looking at, so
  that I can annotate a site whose code I do not control.
- As a reviewer, I want my annotations to stay with the page across reloads and
  as I move through the site, so that a review can span many pages and days.
- As a reviewer, I want every annotation to carry a faithful picture of what I
  saw, so that the reader understands it without opening the site.
- As a reviewer, I want one place listing everything I recorded, grouped by
  site, so that I can check, tidy and export a review.
- As a reviewer, I want a PDF I am not embarrassed to send, so that I can hand
  a client or developer a finished document.
- As a reviewer, I want to drop the review into a Slack channel, so that my
  team sees it where they already work.
- As a privacy-conscious user, I want nothing to leave my machine unless I
  export it, and the extension to touch only pages I switched it on for.

## Functional Requirements

### Switching on and annotating
- FR-1: The reviewer can switch SitePing on and off for the current tab from
  the extension's toolbar button, and from a keyboard shortcut.
- FR-2: Once on, the page shows the SitePing widget with its existing
  behaviour: draw a region, choose a type, write a message, see markers, open
  the panel, resolve, reopen, delete, reply.
- FR-3: While SitePing stays on in a tab, it stays on across reloads and
  navigations within the same site, including navigations that do not reload
  the page, and shows the feedback that belongs to each page.
- FR-4: On a page where the extension cannot run (browser pages, the
  extension store), the toolbar button says so instead of failing silently.
- FR-5: The site is unaffected when SitePing is off: nothing is injected and
  nothing is stored.

### Local storage
- FR-6: Feedback, replies and screenshots are stored in the browser profile
  only. No account, server or network call is involved in creating, reading or
  changing them.
- FR-7: Feedback is grouped by site (origin). Feedback recorded on one page of
  a site is shown as markers on that page only.
- FR-8: Feedback recorded at the same moment in two tabs is all kept.
- FR-9: When the browser refuses to store a screenshot for lack of space, the
  feedback text is still saved and the reviewer is not told it was saved with
  a picture.
- FR-10: Stored data the extension cannot read is left in place, not deleted.

### Screenshots
- FR-11: Each annotation records a picture of the annotated region with
  surrounding context, showing the page as the reviewer saw it, including
  images served from other sites. SitePing's own controls are not in it.
- FR-12: The annotated region is marked on the picture wherever it is shown.

### Review page
- FR-13: The extension has a review page listing all stored feedback, newest
  first, with its site, page, type, status, author, date, message, replies
  and screenshot.
- FR-14: The reviewer can narrow the list by site, status and type, and
  choose which feedback an export includes (all shown by default).
- FR-15: The reviewer can change a feedback's status and delete feedback from
  the review page; the page reflects changes made in other tabs without a
  manual reload.
- FR-16: The reviewer can open the page a feedback was recorded on.
- FR-17: The reviewer can set the name and email recorded as the author, once,
  for every site.

### PDF export
- FR-18: The reviewer can export the chosen feedback as a single PDF file that
  downloads directly, without a print dialog and without a network call.
- FR-19: The PDF opens with the site, the export date and totals by status and
  type, then shows each feedback with its number, type, status, message, page
  link, author, date, replies and screenshot with the region marked.
- FR-20: The PDF is laid out for reading: consistent typography and spacing, a
  feedback's parts kept together where they fit on a page, page numbers, and
  page links that can be clicked. Text in Latin scripts can be selected and
  searched; text in other scripts is shown as written (FR-21) but may not be
  selectable.
- FR-21: Text in any language, and emoji, appears in the PDF as written. It is
  never replaced by placeholder characters.
- FR-22: Exporting 200 feedback items with screenshots completes in under 10
  seconds on a laptop, and the page stays responsive while it runs.

### Slack export
- FR-23: The reviewer can send the chosen feedback to a Slack channel as a
  formatted message, through a Slack Incoming Webhook address that they create
  in their own workspace and paste once into the extension's settings. The
  extension ships no Slack app and asks for no Slack sign-in.
- FR-24: The reviewer can copy the chosen feedback as a ready-to-paste Slack
  message, for use without any Slack setup.
- FR-25: The Slack message names the site, gives the totals, and lists each
  feedback with its number, type, status, message, page link, author and date.
  A review too long for one message is sent as consecutive parts.
- FR-26: Text written by a reviewer cannot trigger Slack mentions or disguise
  links in the message.
- FR-27: The reviewer is told whether the send succeeded, and on failure what
  Slack answered and how much was delivered.
- FR-28: Screenshots are not sent to Slack: a webhook cannot carry files, and
  the pictures exist only on the reviewer's machine. The Slack message says
  that the screenshots are in the PDF export.

### Privacy and permissions
- FR-29: Installing the extension asks for no access to any website. Page
  access exists only for a tab the reviewer switched SitePing on for.
- FR-30a: While SitePing is on for a site, the widget keeps the ids of the
  feedback sent from this browser in that site's own local storage, as it does
  when embedded. Nothing else is stored outside the extension.
- FR-30: The only network destination the extension ever contacts is Slack,
  only when the reviewer sends an export, and only at the address the reviewer
  configured. The extension states what is sent before it is sent.
- FR-31: The Slack address is accepted only when it is a Slack address.

### Browsers and delivery
- FR-32: The same extension works in Chrome 116 or later and in Safari 16.4
  or later on macOS.
- FR-33: The repository produces, from one command each, a Chrome build that
  loads as an unpacked extension and a Safari build that converts into an app.
  CI attaches a Chrome zip and an unsigned Safari app to each run, and the
  documentation explains installing both.
- FR-34: The feature does not change the behaviour or public API of the
  published SitePing packages.

## Out of Scope

- Syncing reviews between devices or people.
- Importing feedback from, or pushing it to, a SitePing server.
- Firefox.
- A translated extension interface (the widget on the page keeps following the
  browser language as it does today).
- Editing a feedback's text after it is recorded.
- iOS and iPadOS Safari.
- Publishing to the Chrome Web Store or the App Store, and signing or
  notarising the Safari app: both need the owner's developer accounts.
- A Slack app, Slack sign-in, or uploading files to Slack.

## Acceptance Criteria

- [ ] With the extension installed and no other setup, switching it on for a
      page of an arbitrary site shows the widget; drawing a region and
      submitting a message leaves a marker that survives a reload.
- [ ] Navigating to another page of the same site keeps SitePing on and shows
      only that page's markers; returning shows the first page's again.
- [ ] The stored feedback has a screenshot whose pixels match the page
      (including a cross-origin image) and exclude SitePing's controls.
- [ ] Two tabs submitting feedback at the same moment both appear in the
      review page.
- [ ] The review page lists feedback from two different sites, filters to one,
      and updates when a third feedback is added in another tab.
- [ ] "Export PDF" downloads a file that a PDF reader opens without warnings,
      whose first page shows the site, date and totals, whose text can be
      found by search, whose page links open the recorded page, and which
      shows a message containing Japanese text and an emoji as written.
- [ ] "Send to Slack" with a valid address posts a message that Slack accepts,
      within Slack's size limits, and reports success; with an address Slack
      rejects it reports Slack's answer.
- [ ] A feedback whose text is `<!channel> <https://evil.example|click>` shows
      that text literally in Slack.
- [ ] "Copy for Slack" puts the message on the clipboard.
- [ ] The shipped manifest lists no website access among its required
      permissions, and with SitePing off a page has no SitePing element.
- [ ] While annotating and reviewing, the browser makes no network request on
      the extension's behalf.
- [ ] The Chrome build loads as an unpacked extension; the Safari build
      converts and compiles into an app.
- [ ] `bun run verify` passes with `packages/*` sources unchanged.

## Clarifications

Resolved on 2026-11-14. Nobody was available to ask, so each answer is the
conservative reading of the task and is recorded as an assumption the owner can
overturn.

- Export size (FR-22): 200 items in under 10 seconds. A site review rarely
  exceeds a few dozen items; 200 leaves a wide margin.
- Slack mechanism (FR-23): an Incoming Webhook. It is the only Slack mechanism
  that needs no hosted component, which "everything is local" rules out.
- Screenshots in Slack (FR-28): no, for the reason in the requirement.
- Browsers (FR-32): Chrome 116+, Safari 16.4+ on macOS. Safari is validated by
  converting and compiling the extension, not by running it: no macOS browser
  is available to this task. The documentation states that limit.
- Publication (FR-33): not part of this task.

## Open Questions

None blocking. For the owner, after delivery:

- Whether to publish to the Chrome Web Store and the App Store, under which
  accounts.
- Whether a reviewer should be able to keep SitePing on for a site
  permanently. It needs access to every website to keep screenshots working,
  which this version deliberately does not ask for.
