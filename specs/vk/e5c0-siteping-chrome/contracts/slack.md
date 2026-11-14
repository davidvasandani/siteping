# Contract: Slack export

## Webhook address

Accepted only when it parses as a URL with protocol `https:`, host exactly
`hooks.slack.com`, no credentials, no port, and a path starting `/services/`.

## Request

`POST <address>`, `Content-Type: application/json`, one request per part, in
order, stopping at the first failure.

```ts
interface SlackPayload {
  /** Fallback shown in notifications. */
  text: string;
  blocks: SlackBlock[]; // at most 50
}
```

Part 1 opens with a `header` block (plain text, at most 150 characters), a
`context` block with the totals and export date, and a `divider`. Every part
then carries one `section` (mrkdwn, at most 3000 characters) per feedback, at
most 20 feedback per part, and ends with a `context` block: `Part i of n` when
there are several, and on the last part "Screenshots are in the PDF export."

A feedback section:

```
*#3*  ·  Bug  ·  Open
> first line of the message
> second line
<https://example.com/pricing|/pricing>  ·  Ada  ·  14 Nov 2026
```

The message is cut at 600 characters with an ellipsis; the PDF has it whole.
`&`, `<`, `>` in reviewer text are written `&amp;`, `&lt;`, `&gt;`. In a link's
address `&` is written `&amp;` and `|`, `<`, `>` are percent-encoded.

The 3000-character limit is checked on the text as sent, after escaping. A
section over it is rebuilt without the link, then with a shorter quote (300,
150, 60 characters, then none).

## Response

Success is HTTP 200. Anything else is a failure reported as
`Slack answered <status>: <body>` together with how many parts were delivered.

## Clipboard

`text/plain`: the same content as mrkdwn-free plain text. `text/html`: the
same content as headings, block quotes and links, with reviewer text escaped.
