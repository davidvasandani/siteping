# Contract: shipped manifest

Both targets:

```json
{
  "manifest_version": 3,
  "name": "SitePing",
  "version": "<apps/extension/package.json version>",
  "description": "Annotate any website. Everything stays on your machine; export to PDF or Slack.",
  "permissions": ["activeTab", "scripting", "storage", "unlimitedStorage"],
  "optional_host_permissions": ["https://hooks.slack.com/*"],
  "action": { "default_popup": "popup.html", "default_title": "SitePing", "default_icon": { "16": "…", "32": "…" } },
  "icons": { "16": "…", "32": "…", "48": "…", "128": "…" },
  "commands": {
    "toggle-siteping": {
      "suggested_key": { "default": "Alt+Shift+S" },
      "description": "Switch SitePing on or off for this tab"
    }
  }
}
```

Must not appear: `host_permissions`, `content_scripts`,
`web_accessible_resources`, `externally_connectable`, `tabs`, `<all_urls>`.

Per target:

| Target | `background` | Extra |
| --- | --- | --- |
| chrome | `{ "service_worker": "background.js" }` | `"minimum_chrome_version": "116"` |
| safari | `{ "scripts": ["background.js"], "persistent": false }` | none |

Files next to it: `background.js`, `content.js`, `popup.html`, `popup.js`,
`review.html`, `review.js`, `styles.css`, `icons/icon-{16,32,48,128}.png`.
