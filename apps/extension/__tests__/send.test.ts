import { describe, expect, it, vi } from "vitest";
import type { SlackPayload } from "../src/slack/message.js";
import { SlackSendError, sendToSlack } from "../src/slack/send.js";

const HOOK = "https://hooks.slack.com/services/T000/B000/abcdef";
const payload = (text: string): SlackPayload => ({ text, blocks: [] });
const wait = async () => {};

describe("sendToSlack", () => {
  it("posts each part as JSON, in order, without cookies or a referrer", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("ok"));
    const waits: number[] = [];

    await sendToSlack(HOOK, [payload("one"), payload("two")], {
      fetch,
      wait: async (ms) => void waits.push(ms),
    });

    expect(fetch.mock.calls.map(([url, init]) => [url, (init as RequestInit).body])).toEqual([
      [HOOK, JSON.stringify(payload("one"))],
      [HOOK, JSON.stringify(payload("two"))],
    ]);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    // One pause, between the two parts.
    expect(waits).toHaveLength(1);
  });

  it("reports what Slack answered when it refuses", async () => {
    const fetch = vi.fn(async () => new Response("no_service", { status: 404 }));

    const error = await sendToSlack(HOOK, [payload("one")], { fetch, wait }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SlackSendError);
    expect((error as SlackSendError).message).toBe("Slack answered 404: no_service. Nothing was sent.");
    expect(error).toMatchObject({ delivered: 0, total: 1 });
  });

  it("stops at the first failure and says how much was delivered", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("ok"))
      .mockResolvedValueOnce(new Response("invalid_payload", { status: 400 }));

    const error = await sendToSlack(HOOK, [payload("1"), payload("2"), payload("3")], { fetch, wait }).catch(
      (caught: unknown) => caught,
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect((error as SlackSendError).message).toBe(
      "Slack answered 400: invalid_payload. 1 of 3 parts were sent before that.",
    );
  });

  it("reports a network failure", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(sendToSlack(HOOK, [payload("one")], { fetch, wait })).rejects.toThrow(
      "Slack could not be reached. Nothing was sent.",
    );
  });

  it("refuses to post anywhere that is not a Slack webhook", async () => {
    const fetch = vi.fn();

    await expect(sendToSlack("https://evil.example/collect", [payload("one")], { fetch, wait })).rejects.toThrow(
      "The Slack address is not an Incoming Webhook. Nothing was sent.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
