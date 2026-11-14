# Contract: runtime messages

All messages are JSON. Every request to the background gets one reply:

```ts
type Reply<T> = { ok: true; value: T } | { ok: false; error: WireError };

interface WireError {
  /** Which core store error to rethrow on the caller's side, when it is one. */
  kind: "duplicate" | "not_found" | "limit" | "persistence" | "other";
  message: string;
}
```

The background ignores any message whose `sender.id` is not the extension's
own id, and answers an unknown `type` with `kind: "other"`.

## To the background (`runtime.sendMessage`)

| `type` | Fields | Reply value | Notes |
| --- | --- | --- | --- |
| `feedback:create` | `input: FeedbackCreateInput` | `Serialized<FeedbackRecord>` | duplicate `clientId` answers `kind: "duplicate"` |
| `feedback:list` | `query: FeedbackQuery` | `{ feedbacks: Serialized<FeedbackRecord>[]; total: number }` | |
| `feedback:find` | `clientId: string` | `Serialized<FeedbackRecord> \| null` | |
| `feedback:owns` | `id: string; projectName: string` | `boolean` | `verifyProjectOwnership` of the store contract |
| `feedback:status` | `id: string; status: FeedbackStatus` | `Serialized<FeedbackRecord>` | `resolvedAt` derived with `toFeedbackUpdate` in the background |
| `feedback:delete` | `id: string` | `null` | |
| `feedback:deleteAll` | `projectName: string` | `null` | |
| `comment:add` | `feedbackId: string; input: CommentCreateInput` | `Serialized<CommentRecord>` | |
| `capture` | none | `{ dataUrl: string }` | PNG of the sender's tab; refused unless the sender is the active tab of its window |
| `tab:get` | `tabId: number` | `{ enabled: boolean }` | |
| `tab:self` | none | `{ enabled: boolean }` | a content script asking about its own tab, after a restore from the back/forward cache |
| `tab:set` | `tabId: number; enabled: boolean` | `{ enabled: boolean }` | fails with a readable message where the extension cannot run |
| `settings:set` | `settings: Settings` | `Settings` | stored after normalising; an address that is not a Slack webhook is refused |
| `stats` | none | `{ projectName: string; total: number; open: number }[]` | for the popup, without screenshots |

## To a content script (`tabs.sendMessage`)

| `type` | Effect |
| --- | --- |
| `unmount` | destroy the widget in this page |
| `navigated` | the tab's URL changed without a reload: `instance.refresh()` |

No reply is expected; a missing receiver is not an error.
