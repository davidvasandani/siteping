---
title: Exporting to Slack through an Incoming Webhook
tags: [slack, export, webhook, escaping, extension]
tasks: [vk/e5c0-siteping-chrome]
---

# Slack export

**Where:** `apps/extension/src/slack/` (`message.ts`, `send.ts`) and the send
flow in `apps/extension/src/ui/review.ts`.

## Why a webhook
It is the only Slack mechanism with no hosted component and no workspace
token in the browser. It cannot carry files, so screenshots stay in the PDF
and the message says so. A clipboard copy (`text/plain` and `text/html`)
covers users without a webhook.

## Limits, as enforced
- 50 blocks per message: 20 feedback per part, the first part also carries
  header, totals and a divider.
- 150 characters in a header.
- 3000 characters in a section's text, measured on the text **as sent**.
  Escaping turns one `&` into five characters, so measure after escaping and
  rebuild smaller (drop the link, then shorten the quote); never cut the
  escaped string, which could cut an entity.
- About one message a second: parts are sent 1.1 s apart, stopping at the
  first failure and reporting how many were delivered.

## Escaping
`&`, `<`, `>` in user text become entities; that alone stops `<!channel>`,
`<@U…>` and disguised links. In a link's address, `&` becomes `&amp;` and
`|`, `<`, `>` are percent-encoded (`|` would start the label).

## Address and permission
Accept only `https://hooks.slack.com/services/…`: exact host, no port, no
credentials (`https://hooks.slack.com@evil.example/` parses with another
host). Check it at the form and again at the send. Reading Slack's answer
(`no_service`, `invalid_payload`) needs the host permission, since Slack
answers no CORS preflight; a `no-cors` request would need none but hides the
answer.

## Not verified
No real workspace was available: the payloads are checked against Slack's
documented limits and a routed stand-in, not a live post.
