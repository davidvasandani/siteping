# Data model: SitePing browser extension

## Stored in `storage.local`

| Key | Value | Written by |
| --- | --- | --- |
| `fb:<feedbackId>` | `Serialized<FeedbackRecord>` (core type; dates as ISO strings; `screenshotUrl` holds the JPEG data URL; `comments` always present) | background only |
| `settings` | `Settings` | background only (the review page sends `settings:set`) |

`FeedbackRecord` is `packages/core/src/types.ts`'s, unchanged. Fields as the
extension fills them:

- `projectName`: the page origin, e.g. `https://example.com`.
- `url`: `pathname + search` with `siteping`, `utm_*`, `gclid`, `fbclid`
  removed. Relative, so `new URL(url, projectName)` is the page.
- `urlPattern`: always `null`.
- `authorName`, `authorEmail`: from `Settings`; name falls back to
  `"Reviewer"`, email to `""`.
- `screenshotUrl`: `data:image/jpeg;base64,…` or `null`.
- `screenshotRegion`: the drawn rect inside the image, as fractions.

Revival is lenient: a value that is not an object with a string `id`, valid
`createdAt`/`updatedAt` and an `annotations` array is skipped and left in
storage (FR-10).

```ts
interface Settings {
  /** Author recorded on new feedback. */
  name: string;
  email: string;
  /** Slack Incoming Webhook, or "" when not configured. */
  slackWebhookUrl: string;
}
```

## Stored in `storage.session`

| Key | Value | Meaning |
| --- | --- | --- |
| `tabs` | `number[]` | Tab ids with SitePing switched on. Cleared with the browser session. |

## In memory only

- Background: the revived snapshot (`FeedbackRecord[]`, newest first), dropped
  whenever the worker is stopped.
- Review page: the snapshot it last read, filters, and the set of ids the
  reviewer deselected.

## Derived for exports

```ts
interface ReportItem {
  number: number;             // 1-based position in the export
  id: string;
  type: FeedbackType;
  status: FeedbackStatus;
  message: string;
  pageUrl: string;            // absolute
  pageLabel: string;          // path as shown
  author: string;
  createdAt: Date;
  viewport: string;
  comments: { author: string; body: string; createdAt: Date }[];
  screenshot: { dataUrl: string; region: ScreenshotRegion | null } | null;
}

interface Report {
  site: string | null;        // origin, or null when several sites are mixed
  generatedAt: Date;
  items: ReportItem[];
}
```

Both exports take a `Report`; neither reads storage.
