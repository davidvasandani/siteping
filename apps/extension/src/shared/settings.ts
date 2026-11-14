import { IDENTITY_FIELD_MAX_LENGTH, isRecord, isValidEmail } from "@siteping/core";
import type { StorageArea } from "./browser.js";

export const SETTINGS_KEY = "settings";

export interface Settings {
  /** Author recorded on new feedback; empty until the reviewer sets it. */
  name: string;
  email: string;
  /** Slack Incoming Webhook the "Send to Slack" export posts to, or `""`. */
  slackWebhookUrl: string;
}

export const DEFAULT_SETTINGS: Settings = { name: "", email: "", slackWebhookUrl: "" };

/** Name shown as the author until the reviewer enters theirs. */
export const FALLBACK_AUTHOR = "Reviewer";

/**
 * Whether `url` is a Slack Incoming Webhook. The export sends the review's
 * text there, so anything that could be another host is refused: the host
 * must be exactly `hooks.slack.com` over https, with no credentials or port
 * (`https://hooks.slack.com@evil.example/` parses with host `evil.example`).
 */
export function isSlackWebhookUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.hostname === "hooks.slack.com" &&
    parsed.port === "" &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.pathname.startsWith("/services/")
  );
}

export class InvalidSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSettingsError";
  }
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * Settings as they are stored: trimmed, with unknown fields dropped. Throws
 * `InvalidSettingsError` for a value the reviewer has to correct, so a wrong
 * webhook address is refused at the form and never reaches an export.
 */
export function normalizeSettings(input: unknown): Settings {
  const source = isRecord(input) ? input : {};
  const settings: Settings = {
    name: text(source.name),
    email: text(source.email),
    slackWebhookUrl: text(source.slackWebhookUrl),
  };
  if (settings.name.length > IDENTITY_FIELD_MAX_LENGTH) throw new InvalidSettingsError("The name is too long.");
  if (settings.email && (settings.email.length > IDENTITY_FIELD_MAX_LENGTH || !isValidEmail(settings.email))) {
    throw new InvalidSettingsError("The email address is not valid.");
  }
  if (settings.slackWebhookUrl && !isSlackWebhookUrl(settings.slackWebhookUrl)) {
    throw new InvalidSettingsError("The Slack address must be an Incoming Webhook: https://hooks.slack.com/services/…");
  }
  return settings;
}

/** Stored settings; anything unreadable or no longer valid reads as the defaults. */
export async function readSettings(area: StorageArea): Promise<Settings> {
  const items = await area.get(SETTINGS_KEY);
  try {
    return normalizeSettings(items[SETTINGS_KEY]);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
