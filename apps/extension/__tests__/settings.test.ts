import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  InvalidSettingsError,
  isSlackWebhookUrl,
  normalizeSettings,
  readSettings,
  SETTINGS_KEY,
} from "../src/shared/settings.js";
import { createFakeApi } from "./fake-api.js";

describe("isSlackWebhookUrl", () => {
  it("accepts an Incoming Webhook address", () => {
    expect(isSlackWebhookUrl("https://hooks.slack.com/services/T000/B000/abcdef")).toBe(true);
  });

  it.each([
    ["plain http", "http://hooks.slack.com/services/T/B/x"],
    ["another host", "https://example.com/services/T/B/x"],
    ["a look-alike host", "https://hooks.slack.com.evil.example/services/T/B/x"],
    ["credentials that hide the host", "https://hooks.slack.com@evil.example/services/T/B/x"],
    ["credentials on the right host", "https://user:pw@hooks.slack.com/services/T/B/x"],
    ["a port", "https://hooks.slack.com:8443/services/T/B/x"],
    ["another Slack path", "https://hooks.slack.com/triggers/T/1/x"],
    ["no URL at all", "hooks.slack.com/services/T/B/x"],
    ["empty", ""],
  ])("refuses %s", (_label, url) => {
    expect(isSlackWebhookUrl(url)).toBe(false);
  });
});

describe("normalizeSettings", () => {
  it("trims and drops unknown fields", () => {
    expect(
      normalizeSettings({
        name: "  Ada ",
        email: " ada@example.com ",
        slackWebhookUrl: " https://hooks.slack.com/services/T/B/x ",
        extra: true,
      }),
    ).toEqual({ name: "Ada", email: "ada@example.com", slackWebhookUrl: "https://hooks.slack.com/services/T/B/x" });
  });

  it("reads anything that is not an object as the defaults", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("x")).toEqual(DEFAULT_SETTINGS);
  });

  it.each([
    ["an invalid email", { email: "not-an-email" }],
    ["an overlong name", { name: "x".repeat(201) }],
    ["a webhook on another host", { slackWebhookUrl: "https://example.com/hook" }],
  ])("refuses %s", (_label, input) => {
    expect(() => normalizeSettings(input)).toThrow(InvalidSettingsError);
  });
});

describe("readSettings", () => {
  it("returns the defaults when nothing is stored", async () => {
    expect(await readSettings(createFakeApi().storage.local)).toEqual(DEFAULT_SETTINGS);
  });

  it("returns the defaults when the stored value is no longer valid", async () => {
    const { local } = createFakeApi().storage;
    await local.set({ [SETTINGS_KEY]: { slackWebhookUrl: "https://example.com/hook" } });
    expect(await readSettings(local)).toEqual(DEFAULT_SETTINGS);
  });

  it("returns what was stored", async () => {
    const { local } = createFakeApi().storage;
    await local.set({ [SETTINGS_KEY]: { name: "Ada", email: "", slackWebhookUrl: "" } });
    expect(await readSettings(local)).toEqual({ name: "Ada", email: "", slackWebhookUrl: "" });
  });
});
