import { isSlackWebhookUrl } from "../shared/settings.js";
import type { SlackPayload } from "./message.js";

/** Host permission the send needs: without it the browser applies CORS, which Slack's webhooks do not answer. */
export const SLACK_ORIGIN = "https://hooks.slack.com/*";

/** Slack accepts about one webhook message a second; parts are spaced accordingly. */
const PART_INTERVAL_MS = 1100;

/** A send that did not complete. `delivered` parts reached Slack before it stopped. */
export class SlackSendError extends Error {
  constructor(
    readonly delivered: number,
    readonly total: number,
    detail: string,
    options?: ErrorOptions,
  ) {
    const progress =
      total > 1 && delivered > 0 ? ` ${delivered} of ${total} parts were sent before that.` : " Nothing was sent.";
    super(`${detail}${progress}`, options);
    this.name = "SlackSendError";
  }
}

export interface SendDeps {
  fetch?: typeof fetch;
  /** Wait between parts. */
  wait?: (ms: number) => Promise<void>;
}

/**
 * Post the payloads to a Slack Incoming Webhook, in order, stopping at the
 * first failure. The address is checked here as well as at the settings
 * form: this is the one place the extension sends anything anywhere.
 */
export async function sendToSlack(
  webhookUrl: string,
  payloads: readonly SlackPayload[],
  deps: SendDeps = {},
): Promise<void> {
  const send = deps.fetch ?? fetch;
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const total = payloads.length;
  if (!isSlackWebhookUrl(webhookUrl)) {
    throw new SlackSendError(0, total, "The Slack address is not an Incoming Webhook.");
  }

  for (const [index, payload] of payloads.entries()) {
    if (index > 0) await wait(PART_INTERVAL_MS);
    let response: Response;
    try {
      response = await send(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
    } catch (cause) {
      throw new SlackSendError(index, total, "Slack could not be reached.", { cause });
    }
    if (!response.ok) {
      // Slack answers in a word or two: `no_service`, `invalid_payload`, `channel_is_archived`.
      const reason = (await response.text().catch(() => "")).trim().slice(0, 200);
      throw new SlackSendError(index, total, `Slack answered ${response.status}${reason ? `: ${reason}` : ""}.`);
    }
  }
}
