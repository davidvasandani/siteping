# Data model: extension recordings

## IndexedDB `siteping-recordings`, version 1

### Object store `recordings`

Key path: `feedbackId` (string). Index: `projectName` (non-unique).

| Field | Type | Rule |
| --- | --- | --- |
| `feedbackId` | string | Existing feedback owner; primary key |
| `projectName` | string | Owner's site, used for Delete all |
| `pageUrl` | string | Absolute current-tab URL at capture start |
| `mimeType` | string | Actual MediaRecorder Blob MIME |
| `byteLength` | number | Positive integer |
| `durationMs` | number | Positive, at most small recorder tolerance over 120000 |
| `createdAt` | ISO string | Completion timestamp |
| `poster` | Blob or null | JPEG first usable video frame |
| `video` | Blob | Non-empty WebM video |

Replacement is one readwrite transaction. The old record remains if the new
Blob/poster commit fails.

### Object store `sessions`

Singleton key `active`:

| Field | Type | Rule |
| --- | --- | --- |
| `id` | `"active"` | Singleton key |
| `feedbackId`, `projectName`, `pageUrl` | string | Intended owner |
| `tabId` | integer | Captured tab |
| `startedAt` | ISO string | Timer/recovery source |
| `limitMs` | number | 120000 in production |
| `state` | `starting \| recording \| stopping` | Non-terminal only |

The offscreen writer creates/updates/removes it. Stale presence without the
writer becomes an interrupted failure during reconciliation.

## `storage.local`

`recording-gc`: an array of `{ feedbackId?: string, projectName?: string }`
idempotent cleanup intents. Background writes the queue because it owns
feedback deletion; offscreen consumes intents and background removes confirmed
entries. No video data is stored here.

## Ephemeral view models

`RecordingState` is JSON-only: phase, target ids, timestamps, stop reason, and
optional human-readable error. `RecordingExport` contains duration and poster
bytes/object data inside the review page only; it never enters core records.

## Invariants

- One active session extension-wide.
- At most one recording per feedback.
- A completed record is exposed only while its owner feedback exists.
- One offscreen context writes IndexedDB; review/popup may read.
- Video/poster Blobs never cross runtime messaging or network boundaries.

