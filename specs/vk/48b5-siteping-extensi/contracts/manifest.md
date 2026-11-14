# Contract: recording manifest delta

Chrome permissions, exact order:

```json
["activeTab", "scripting", "storage", "unlimitedStorage", "tabCapture", "offscreen"]
```

Safari permissions remain:

```json
["activeTab", "scripting", "storage", "unlimitedStorage"]
```

Neither target adds `host_permissions`, a content script, or site access at
install. Both retain the optional Slack host permission. Chrome bundles
`offscreen.html`/`offscreen.js`; Safari need not.

Both targets add:

```json
"record-siteping": {
  "suggested_key": { "default": "Alt+Shift+R" },
  "description": "Start or stop a SitePing screen recording"
}
```

The exact shipped objects and file lists are asserted by `build.test.ts`.

