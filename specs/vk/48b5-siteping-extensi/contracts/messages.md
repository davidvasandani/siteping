# Contract: recording messages

Existing `Reply<T>`/`WireError` wrapping remains.

## Requests to background

| Type | Fields | Reply |
| --- | --- | --- |
| `recording:start` | `tabId`, `feedbackId` | `RecordingState` |
| `recording:stop` | `reason: "manual" \| "limit"` | `RecordingState` |
| `recording:state` | none | `RecordingState` |
| `recording:delete` | `feedbackId` | `null` |

Start validates sender/user invocation, active tab, enabled SitePing, owner
feedback and page scope before obtaining a stream id. Delete is idempotent.

## Background to content script

| Type | Effect |
| --- | --- |
| `recording:show` | Mount indicator from state |
| `recording:tick` | Update elapsed/remaining |
| `recording:hide` | Remove indicator and optionally announce result |

The indicator's Stop sends `recording:stop` to background.

## Background/offscreen control

Internal messages are addressed with `target: "offscreen"` and contain
`start` (stream id plus owner descriptor), `stop`, `state`, or `delete/GC`.
Replies contain JSON state/errors only. Blob data is forbidden.

## RecordingState

```ts
type RecordingState =
  | { phase: "idle"; lastResult?: RecordingResult }
  | { phase: "starting" | "recording" | "stopping"; session: SessionSummary };

interface SessionSummary {
  feedbackId: string;
  projectName: string;
  pageUrl: string;
  tabId: number;
  startedAt: string;
  limitMs: number;
}
```

