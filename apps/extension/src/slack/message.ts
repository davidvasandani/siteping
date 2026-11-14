import type { FeedbackType } from "@siteping/core";
import { formatDate, STATUS_LABEL, TYPE_LABEL } from "../shared/labels.js";
import { countItems, plural, type Report, type ReportItem } from "../shared/report.js";

/**
 * The review as Slack messages (Block Kit, for an Incoming Webhook) and as
 * clipboard content for pasting into Slack by hand.
 *
 * Slack's limits shape it: a message holds at most 50 blocks, a section's
 * text at most 3000 characters, a header's 150. A long review is therefore
 * split into parts, and a long message is quoted in part; the PDF export
 * has it whole, with the screenshots a webhook cannot carry.
 */

export type SlackBlock =
  | { type: "header"; text: { type: "plain_text"; text: string; emoji: true } }
  | { type: "section"; text: { type: "mrkdwn"; text: string } }
  | { type: "context"; elements: { type: "mrkdwn"; text: string }[] }
  | { type: "divider" };

export interface SlackPayload {
  /** Shown in notifications and by clients that do not render blocks. */
  text: string;
  blocks: SlackBlock[];
}

/** Feedback per message: with the blocks around them, well under Slack's 50. */
export const ITEMS_PER_MESSAGE = 20;
/** Characters of a feedback's message quoted in Slack. */
export const EXCERPT_LENGTH = 600;
const SECTION_LIMIT = 3000;
const HEADER_LIMIT = 150;
const LABEL_LIMIT = 120;

const TYPE_EMOJI: Record<FeedbackType, string> = { question: "❓", change: "✏️", bug: "🐞", other: "💬" };

const SEPARATOR = "  ·  ";

/**
 * Text written by a reviewer, safe inside mrkdwn. Slack reads `<…>` as a
 * link, a mention (`<!channel>`, `<@U123>`) or a command, and `&` as the
 * start of an entity; with the three escaped the text shows literally.
 */
export function escapeMrkdwn(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const escapeHtml = (text: string): string => escapeMrkdwn(text).replace(/"/g, "&quot;");

/** `text` in at most `limit` characters, the last an ellipsis when something was cut. */
function cut(text: string, limit: number): string {
  const chars = [...text];
  return chars.length <= limit
    ? text
    : `${chars
        .slice(0, limit - 1)
        .join("")
        .trimEnd()}…`;
}

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * A link in mrkdwn. In the address `|` would start the label and `>` end the
 * link, so both are percent-encoded; `&` is written as its entity like
 * everywhere else in the text, which Slack turns back into `&`.
 */
function link(url: string, label: string): string {
  const address = url.replace(/&/g, "&amp;").replace(/\|/g, "%7C").replace(/</g, "%3C").replace(/>/g, "%3E");
  return `<${address}|${escapeMrkdwn(label)}>`;
}

function summary(report: Report): string {
  const { status } = countItems(report.items);
  return [
    `Exported ${formatDate(report.generatedAt)}`,
    plural(report.items.length, "item"),
    ...(report.siteCount > 1 ? [plural(report.siteCount, "site")] : []),
    `${status.open} open`,
    ...(status.in_progress > 0 ? [`${status.in_progress} in progress`] : []),
    ...(status.resolved > 0 ? [`${status.resolved} resolved`] : []),
    ...(status.wont_fix > 0 ? [`${status.wont_fix} won't fix`] : []),
  ].join(SEPARATOR);
}

/** Shorter and shorter quotes to try when a section does not fit; the last keeps only the head and the foot. */
const EXCERPT_STEPS = [EXCERPT_LENGTH, 300, 150, 60, 0];

/**
 * One feedback as a section's text, within Slack's limit. The limit applies
 * to the text as sent, after escaping, where one `&` has become five
 * characters and an address can be thousands long. So the section is built
 * and measured, and when it is too long it is rebuilt with less: first
 * without the link (the label still says where), then with a shorter quote.
 * The PDF has every message whole.
 */
function itemSection(item: ReportItem): string {
  const head = `*#${item.number}*${SEPARATOR}${TYPE_EMOJI[item.type]} ${TYPE_LABEL[item.type]}${SEPARATOR}${STATUS_LABEL[item.status]}`;
  const label = cut(oneLine(item.pageLabel), LABEL_LIMIT);
  const build = (excerpt: number, linked: boolean): string => {
    const quote =
      excerpt > 0
        ? escapeMrkdwn(cut(item.message.trim(), excerpt))
            .split(/\r?\n/)
            .map((line) => `> ${line}`.trimEnd())
        : [];
    const foot = [
      linked && item.pageUrl ? link(item.pageUrl, label) : escapeMrkdwn(label),
      escapeMrkdwn(cut(oneLine(item.author), LABEL_LIMIT)),
      formatDate(item.createdAt),
      ...(item.comments.length > 0 ? [item.comments.length === 1 ? "1 reply" : `${item.comments.length} replies`] : []),
    ].join(SEPARATOR);
    return [head, ...quote, foot].join("\n");
  };

  for (const excerpt of EXCERPT_STEPS) {
    for (const linked of [true, false]) {
      const text = build(excerpt, linked);
      if (text.length <= SECTION_LIMIT) return text;
    }
  }
  // Unreachable with the limits above (head and foot alone stay under 1500
  // characters); kept so the function can never hand Slack an oversized section.
  return build(0, false).slice(0, SECTION_LIMIT);
}

/** The review as webhook payloads, to post in order. */
export function buildSlackMessages(report: Report): SlackPayload[] {
  const title = cut(`SitePing feedback${SEPARATOR}${oneLine(report.title)}`, HEADER_LIMIT);
  const chunks: ReportItem[][] = [];
  for (let start = 0; start < report.items.length; start += ITEMS_PER_MESSAGE) {
    chunks.push(report.items.slice(start, start + ITEMS_PER_MESSAGE));
  }
  if (chunks.length === 0) chunks.push([]);

  return chunks.map((items, index) => {
    const part = chunks.length > 1 ? `Part ${index + 1} of ${chunks.length}` : "";
    const last = index === chunks.length - 1;
    const closing = [part, last ? "Screenshots are in the PDF export." : ""].filter(Boolean).join(SEPARATOR);
    const blocks: SlackBlock[] = [];
    if (index === 0) {
      blocks.push(
        { type: "header", text: { type: "plain_text", text: title, emoji: true } },
        { type: "context", elements: [{ type: "mrkdwn", text: summary(report) }] },
        { type: "divider" },
      );
    }
    for (const item of items) blocks.push({ type: "section", text: { type: "mrkdwn", text: itemSection(item) } });
    if (closing) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: closing }] });
    return { text: [escapeMrkdwn(title), part].filter(Boolean).join(SEPARATOR), blocks };
  });
}

/**
 * The review for the clipboard: plain text, and HTML that Slack's composer
 * turns into bold, quotes and links when pasted.
 */
export function buildClipboard(report: Report): { text: string; html: string } {
  const title = `SitePing feedback${SEPARATOR}${oneLine(report.title)}`;
  const text: string[] = [title, summary(report), ""];
  const html: string[] = [`<p><b>${escapeHtml(title)}</b><br>${escapeHtml(summary(report))}</p>`];

  for (const item of report.items) {
    const head = `#${item.number}${SEPARATOR}${TYPE_LABEL[item.type]}${SEPARATOR}${STATUS_LABEL[item.status]}`;
    const message = cut(item.message.trim(), EXCERPT_LENGTH);
    const label = cut(oneLine(item.pageLabel), LABEL_LIMIT);
    const tail = [oneLine(item.author), formatDate(item.createdAt)].join(SEPARATOR);

    text.push(
      head,
      ...message.split(/\r?\n/).map((line) => `> ${line}`.trimEnd()),
      [item.pageUrl ?? label, tail].join(SEPARATOR),
      "",
    );
    html.push(
      `<p><b>#${item.number}</b>${SEPARATOR}${escapeHtml(TYPE_LABEL[item.type])}${SEPARATOR}${escapeHtml(STATUS_LABEL[item.status])}</p>`,
      `<blockquote>${escapeHtml(message).replace(/\r?\n/g, "<br>")}</blockquote>`,
      `<p>${item.pageUrl ? `<a href="${escapeHtml(item.pageUrl)}">${escapeHtml(label)}</a>` : escapeHtml(label)}${SEPARATOR}${escapeHtml(tail)}</p>`,
    );
  }
  return { text: text.join("\n").trimEnd(), html: html.join("") };
}
