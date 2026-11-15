# Project knowledge base

Reusable, non-obvious knowledge distilled from shipped tasks. One topic per page;
each page lists the task ids that contributed to it.

| Page | Summary | Tasks |
| --- | --- | --- |
| [widget-host-scrolling](widget-host-scrolling.md) | Scrolling host content from the widget: app shells, inner/nested scrollers, clipped viewports, RTL/reverse ranges, testing recipes | vk/57e4-fix-go-to-annota |
| [fork-releases](fork-releases.md) | Shipping fork builds as immutable GitHub release tarballs (`<component>-v<base>-fork.<N>` tags, `npm pack`, draft → upload → publish), upstream's npm jobs scoped to upstream, backport branches from upstream tags, consuming by URL + lockfile integrity | vk/9d5e-make-our-sitepin |
| [annotation-navigation](annotation-navigation.md) | Navigate to the recorded page before resolving shared anchors; safe same-origin deep links and compatible Teemay backports | vk/16ab-siteping-didn-t |
| [browser-extension](browser-extension.md) | `apps/extension`: widget injection, local feedback, derived browser/OS/device/viewport labels, Chrome tab recording, one writer per store, exact permissions, capture seams, e2e recipes and Safari limits | vk/e5c0-siteping-chrome, vk/48b5-siteping-extensi, vk/64b1-add-browser-meta |
| [pdf-without-a-library](pdf-without-a-library.md) | A PDF 1.4 writer in the browser: Helvetica metrics from AFM, WinAnsi, JPEG as `DCTDecode`, `CompressionStream` for Flate, canvas fallback for other scripts, verifying with pdf.js and `mutool` | vk/e5c0-siteping-chrome |
| [slack-webhook-export](slack-webhook-export.md) | Incoming Webhook export: Block Kit limits measured after escaping, mention-proof escaping, address validation, why the host permission | vk/e5c0-siteping-chrome |
