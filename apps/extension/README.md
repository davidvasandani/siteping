# SitePing browser extension

SitePing for any website, with nothing to install on the site and no server.
Switch it on for the page in front of you, draw on the page to leave feedback,
and export the review as a PDF or a Slack message. Works in Chrome and in
Safari on macOS.

Everything you record stays in your browser profile. The extension contacts
exactly one outside address, Slack, and only when you press Send.

## Install

Build first, from the repository root:

```sh
bun install
bun run build        # or: bunx turbo run build --filter=@siteping/extension
```

This writes `apps/extension/dist/chrome` and `apps/extension/dist/safari`.
Every CI run of the `Extension` workflow also attaches both as artifacts.

**Chrome** (116 or later; Edge, Brave and other Chromium browsers too):

1. Open `chrome://extensions` and turn on "Developer mode".
2. "Load unpacked", and choose `apps/extension/dist/chrome`.
3. Pin SitePing to the toolbar.

**Safari** (16.4 or later, macOS, needs Xcode):

1. `bun run --cwd apps/extension safari:xcode` generates an Xcode project in
   `apps/extension/dist/safari-xcode`.
2. Open it in Xcode and run the `SitePing` scheme once. Set your own team
   under Signing & Capabilities, or keep it unsigned and enable Safari's
   Develop menu, then "Allow Unsigned Extensions".
3. Safari, Settings, Extensions: enable SitePing.

Set `SITEPING_BUNDLE_ID` before step 1 to use your own bundle identifier.

## Use

1. On any web page, click the SitePing toolbar button and switch on
   "Annotate this page" (or press Alt+Shift+S).
2. Use the round button at the bottom right of the page: draw a rectangle,
   pick a type, write the feedback. A numbered marker stays on the page.
3. SitePing stays on in that tab while you browse the same site, and shows
   each page's own markers. Leaving the site switches it off; switch it on
   again when you come back.
4. "Review and export" in the popup opens the review page: all feedback by
   site, with filters, status changes and delete.

### Export to PDF

"Export PDF" downloads one file: a summary of the site with totals by status
and type, then every feedback with its number, type, status, message, a
clickable link to the page, author, date, replies and the screenshot with the
annotated area outlined. Untick a feedback to leave it out.

The PDF is generated in the browser. Text in Latin scripts is real text
(searchable, selectable). Text in other scripts, and emoji, is drawn with
your system's fonts and placed as an image, so it appears as written but is
not selectable.

### Export to Slack

Two ways:

- **Copy for Slack** puts the review on the clipboard, ready to paste into a
  message. No setup.
- **Send to Slack** posts it to a channel. In Slack, create an Incoming
  Webhook for that channel and paste its address in the review page's
  Settings. Before each send the extension says what it will post.

Screenshots are not sent to Slack (a webhook cannot carry files); the message
says they are in the PDF. A review of more than 20 feedback is posted as
several messages.

## Privacy and permissions

| Permission | Why |
| --- | --- |
| `activeTab` | Access to the one tab you switch SitePing on for, for as long as it stays on that site |
| `scripting` | Putting the widget into that tab |
| `storage`, `unlimitedStorage` | Keeping feedback and screenshots in the browser profile |
| `https://hooks.slack.com/*` (optional) | Asked for at your first "Send to Slack"; needed to read Slack's answer |

The extension has no access to any site at install and declares no content
script: a page is untouched until you switch SitePing on there.

What is stored, and where:

- Feedback, replies, screenshots and settings: the extension's own storage in
  your browser profile. Removing the extension removes them.
- While SitePing is on for a site, the widget also keeps the ids of the
  feedback you sent in that site's `localStorage` (it backs the panel's
  "Mine" filter), as it does when a site embeds SitePing.

What is sent, and where:

- Nothing, until "Send to Slack". That posts the text of the chosen feedback
  (message, page address, type, status, author name, date) to the webhook
  address you saved, which must be on `hooks.slack.com`.

## How it is built

- `src/background` owns the only store (`createCollectionStore` from
  `@siteping/core`, over `storage.local`, one key per feedback). Tabs and
  extension pages send it their writes, so two tabs can never overwrite each
  other.
- `src/content` runs the unmodified widget from `packages/widget` in store
  mode. `scripts/seam.mjs` swaps the widget's screenshot module for
  `src/content/screenshot.ts` at bundle time, which captures the tab's real
  pixels (`tabs.captureVisibleTab`) and falls back to the widget's own
  renderer. The build fails if that swap stops matching.
- `src/pdf` is a small PDF writer and the report layout; `src/slack` builds
  and sends the Slack message; `src/ui` is the popup and the review page.

Tests: `bunx vitest run apps/extension` (unit), and
`bunx playwright test e2e/extension.spec.ts --project=chromium` (the built
extension in Chromium; set `SITEPING_CHROMIUM` to a Chromium binary if the
one Playwright downloads does not start on your system).

## What is and is not verified

- Chrome: covered end to end by `e2e/extension.spec.ts`, with one stand-in.
  A test cannot click the toolbar, so it loads a copy of the build with
  access to all sites in place of the access that click grants. The shipped
  manifest is checked separately.
- Safari: CI converts the build with Apple's tool and compiles the app. It
  has not been run in Safari. Every browser API used is documented for
  Safari 16.4, but expect to test it there before relying on it.
- Slack: tested against Slack's documented limits and a stand-in server, not
  a real workspace.
- Publishing to the Chrome Web Store or the App Store is not set up; both
  need your developer accounts.
