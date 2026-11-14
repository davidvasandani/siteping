import { describe, expect, it } from "vitest";
import { toReport } from "../src/shared/report.js";
import {
  buildClipboard,
  buildSlackMessages,
  EXCERPT_LENGTH,
  escapeMrkdwn,
  ITEMS_PER_MESSAGE,
  type SlackBlock,
} from "../src/slack/message.js";
import { createRecord } from "./fixtures.js";

const at = new Date("2026-11-14T15:00:00Z");

const sections = (blocks: SlackBlock[]): string[] =>
  blocks.flatMap((block) => (block.type === "section" ? [block.text.text] : []));
const contexts = (blocks: SlackBlock[]): string[] =>
  blocks.flatMap((block) => (block.type === "context" ? block.elements.map((element) => element.text) : []));

describe("escapeMrkdwn", () => {
  it("escapes the three characters Slack gives meaning to", () => {
    expect(escapeMrkdwn("a < b && c > d")).toBe("a &lt; b &amp;&amp; c &gt; d");
  });
});

describe("buildSlackMessages", () => {
  it("builds one message: header, totals, one section per feedback, a closing note", () => {
    const records = [
      createRecord({ type: "bug", message: "Button overlaps the table", url: "/pricing", authorName: "Ada" }),
      createRecord({ type: "question", status: "resolved", message: "Is this final?", url: "/about" }),
    ];

    const [payload, ...rest] = buildSlackMessages(toReport(records, at));

    expect(rest).toEqual([]);
    expect(payload?.text).toBe("SitePing feedback  ·  example.com");
    expect(payload?.blocks[0]).toEqual({
      type: "header",
      text: { type: "plain_text", text: "SitePing feedback  ·  example.com", emoji: true },
    });
    expect(contexts(payload?.blocks ?? [])).toEqual([
      "Exported 14 Nov 2026  ·  2 items  ·  1 open  ·  1 resolved",
      "Screenshots are in the PDF export.",
    ]);
    expect(payload?.blocks[2]).toEqual({ type: "divider" });
    expect(sections(payload?.blocks ?? [])).toEqual([
      "*#1*  ·  🐞 Bug  ·  Open\n> Button overlaps the table\n<https://example.com/pricing|/pricing>  ·  Ada  ·  14 Nov 2026",
      "*#2*  ·  ❓ Question  ·  Resolved\n> Is this final?\n<https://example.com/about|/about>  ·  Ada  ·  14 Nov 2026",
    ]);
  });

  it("shows reviewer text literally: no mention, no disguised link", () => {
    const record = createRecord({
      message: "<!channel> <https://evil.example|click> & <@U123>",
      authorName: "<!here>",
      url: "/a?x=<b>|c",
    });

    const [text] = sections(buildSlackMessages(toReport([record], at))[0]?.blocks ?? []);

    expect(text).toContain("> &lt;!channel&gt; &lt;https://evil.example|click&gt; &amp; &lt;@U123&gt;");
    expect(text).toContain("&lt;!here&gt;");
    // The only real link is the page, and its address cannot end early.
    expect(text?.match(/<[^>]*>/g)).toEqual(["<https://example.com/a?x=%3Cb%3E%7Cc|/a?x=&lt;b&gt;|c>"]);
  });

  it("quotes every line of a message and cuts a long one", () => {
    const multi = createRecord({ message: "First line\n\nThird line" });
    const long = createRecord({ message: "x".repeat(2000) });

    const [first, second] = sections(buildSlackMessages(toReport([multi, long], at))[0]?.blocks ?? []);

    expect(first).toContain("> First line\n>\n> Third line\n");
    expect(second).toContain(`> ${"x".repeat(EXCERPT_LENGTH - 1)}…\n`);
  });

  it("mentions replies and falls back to the label when the record has no safe address", () => {
    const record = createRecord({ url: "javascript:alert(1)" });
    record.comments = [1, 2].map((n) => ({
      id: `c${n}`,
      feedbackId: record.id,
      body: "x",
      authorName: "Bo",
      authorEmail: "",
      authorRole: "client" as const,
      clientId: `c${n}`,
      createdAt: at,
    }));

    const [text] = sections(buildSlackMessages(toReport([record], at))[0]?.blocks ?? []);

    expect(text).toMatch(/\njavascript:alert\(1\) {2}· {2}Ada {2}· {2}14 Nov 2026 {2}· {2}2 replies$/);
  });

  it("splits a long review into parts within Slack's limits", () => {
    const records = Array.from({ length: 2 * ITEMS_PER_MESSAGE + 3 }, (_, index) =>
      createRecord({ message: `Item ${index + 1} ${"y".repeat(900)}` }),
    );

    const payloads = buildSlackMessages(toReport(records, at));

    expect(payloads).toHaveLength(3);
    expect(payloads.map((payload) => sections(payload.blocks).length)).toEqual([20, 20, 3]);
    expect(payloads.map((payload) => contexts(payload.blocks).at(-1))).toEqual([
      "Part 1 of 3",
      "Part 2 of 3",
      "Part 3 of 3  ·  Screenshots are in the PDF export.",
    ]);
    expect(payloads.map((payload) => payload.text)).toEqual([
      "SitePing feedback  ·  example.com  ·  Part 1 of 3",
      "SitePing feedback  ·  example.com  ·  Part 2 of 3",
      "SitePing feedback  ·  example.com  ·  Part 3 of 3",
    ]);
    // Only the first part carries the header.
    expect(payloads.map((payload) => payload.blocks[0]?.type)).toEqual(["header", "section", "section"]);
    for (const payload of payloads) {
      expect(payload.blocks.length).toBeLessThanOrEqual(50);
      for (const text of sections(payload.blocks)) expect(text.length).toBeLessThanOrEqual(3000);
    }
  });

  it("drops the link, not the feedback, when an address would overflow a section", () => {
    const record = createRecord({ url: `/search?q=${"a".repeat(4000)}` });

    const [text] = sections(buildSlackMessages(toReport([record], at))[0]?.blocks ?? []);

    expect(text?.length).toBeLessThanOrEqual(3000);
    expect(text).not.toContain("<https://");
    expect(text).toContain("/search?q=aaa");
  });

  it("keeps the header within Slack's 150 characters", () => {
    const report = { ...toReport([createRecord()], at), title: "t".repeat(400) };
    const header = buildSlackMessages(report)[0]?.blocks[0];
    expect(header?.type === "header" && header.text.text.length).toBe(150);
  });

  it("counts every status and several sites in the totals", () => {
    const records = [
      createRecord({ projectName: "https://a.example", status: "in_progress" }),
      createRecord({ projectName: "https://b.example", status: "wont_fix" }),
    ];

    const payload = buildSlackMessages(toReport(records, at))[0];

    expect(contexts(payload?.blocks ?? [])[0]).toBe(
      "Exported 14 Nov 2026  ·  2 items  ·  2 sites  ·  0 open  ·  1 in progress  ·  1 won't fix",
    );
    expect(sections(payload?.blocks ?? [])[0]).toContain("<https://a.example/pricing|a.example/pricing>");
  });

  it("builds a message even for an empty selection", () => {
    const payloads = buildSlackMessages(toReport([], at));
    expect(payloads).toHaveLength(1);
    expect(sections(payloads[0]?.blocks ?? [])).toEqual([]);
  });
});

describe("buildClipboard", () => {
  it("offers plain text and HTML with the same content", () => {
    const record = createRecord({ type: "change", message: "Shorter headline\nplease", url: "/", authorName: "Ada" });

    const { text, html } = buildClipboard(toReport([record], at));

    expect(text).toBe(
      [
        "SitePing feedback  ·  example.com",
        "Exported 14 Nov 2026  ·  1 item  ·  1 open",
        "",
        "#1  ·  Change  ·  Open",
        "> Shorter headline",
        "> please",
        "https://example.com/  ·  Ada  ·  14 Nov 2026",
      ].join("\n"),
    );
    expect(html).toContain("<b>SitePing feedback  ·  example.com</b>");
    expect(html).toContain("<blockquote>Shorter headline<br>please</blockquote>");
    expect(html).toContain('<a href="https://example.com/">/</a>  ·  Ada  ·  14 Nov 2026');
  });

  it("escapes reviewer text in the HTML", () => {
    const record = createRecord({ message: '<img src=x onerror="alert(1)">', authorName: "<b>Ada</b>" });

    const { html } = buildClipboard(toReport([record], at));

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("&lt;b&gt;Ada&lt;/b&gt;");
  });
});
