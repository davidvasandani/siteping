import { describe, expect, it } from "vitest";
import { createHandler } from "../src/background/handler.js";
import { createExtensionStore } from "../src/background/store.js";
import { createTabController } from "../src/background/tabs.js";
import type { Reply } from "../src/shared/messages.js";
import { SETTINGS_KEY } from "../src/shared/settings.js";
import { createFakeApi } from "./fake-api.js";
import { createInput } from "./fixtures.js";

const setup = () => {
  const api = createFakeApi();
  const store = createExtensionStore(api.storage.local);
  const handle = createHandler({ api, store, tabs: createTabController(api) });
  const ok = async <T>(message: unknown, sender = {}): Promise<T> => {
    const reply = (await handle(message, sender)) as Reply<T>;
    if (!reply.ok) throw new Error(`expected ok, got ${reply.error.kind}: ${reply.error.message}`);
    return reply.value;
  };
  return { api, store, handle, ok };
};

describe("createHandler", () => {
  it("creates, lists and finds feedback in serialised form", async () => {
    const { ok } = setup();
    const input = createInput({ message: "Hello" });

    const created = await ok<{ id: string; createdAt: unknown }>({ type: "feedback:create", input });
    const listed = await ok<{ feedbacks: { id: string }[]; total: number }>({
      type: "feedback:list",
      query: { projectName: input.projectName },
    });
    const found = await ok<{ id: string } | null>({ type: "feedback:find", clientId: input.clientId });

    expect(typeof created.createdAt).toBe("string");
    expect(listed).toMatchObject({ total: 1, feedbacks: [{ id: created.id }] });
    expect(found?.id).toBe(created.id);
    expect(await ok({ type: "feedback:find", clientId: "unknown" })).toBeNull();
  });

  it("derives the closure timestamp from the status", async () => {
    const { ok } = setup();
    const { id } = await ok<{ id: string }>({ type: "feedback:create", input: createInput() });

    const resolved = await ok<{ status: string; resolvedAt: string | null }>({
      type: "feedback:status",
      id,
      status: "wont_fix",
    });
    const reopened = await ok<{ resolvedAt: string | null }>({ type: "feedback:status", id, status: "open" });

    expect(resolved.status).toBe("wont_fix");
    expect(resolved.resolvedAt).toEqual(expect.any(String));
    expect(reopened.resolvedAt).toBeNull();
  });

  it("adds a reply and deletes feedback", async () => {
    const { ok, store } = setup();
    const { id } = await ok<{ id: string }>({ type: "feedback:create", input: createInput() });

    const comment = await ok<{ body: string; createdAt: unknown }>({
      type: "comment:add",
      feedbackId: id,
      input: { body: "Thanks", authorName: "Bo", authorEmail: "", authorRole: "client", clientId: "c1" },
    });
    expect(comment).toMatchObject({ body: "Thanks", createdAt: expect.any(String) });

    expect(await ok({ type: "feedback:delete", id })).toBeNull();
    expect(await store.all()).toEqual([]);
  });

  it("deletes every feedback of one site", async () => {
    const { ok, store } = setup();
    await ok({ type: "feedback:create", input: createInput({ projectName: "https://a.example" }) });
    await ok({ type: "feedback:create", input: createInput({ projectName: "https://b.example" }) });

    await ok({ type: "feedback:deleteAll", projectName: "https://a.example" });

    expect((await store.all()).map((record) => record.projectName)).toEqual(["https://b.example"]);
  });

  it("reports store errors by kind", async () => {
    const { handle } = setup();
    const input = createInput();
    await handle({ type: "feedback:create", input }, {});

    expect(await handle({ type: "feedback:create", input }, {})).toMatchObject({
      ok: false,
      error: { kind: "duplicate" },
    });
    expect(await handle({ type: "feedback:delete", id: "missing" }, {})).toMatchObject({
      ok: false,
      error: { kind: "not_found" },
    });
  });

  it("answers an unknown or malformed request instead of leaving the caller waiting", async () => {
    const { handle } = setup();
    for (const message of [null, "x", {}, { type: "nope" }, { type: "constructor" }]) {
      expect(await handle(message, {})).toMatchObject({ ok: false, error: { kind: "other" } });
    }
  });

  it("stores normalised settings and refuses invalid ones", async () => {
    const { api, handle, ok } = setup();

    const saved = await ok({
      type: "settings:set",
      settings: { name: " Ada ", email: "", slackWebhookUrl: "https://hooks.slack.com/services/T/B/x" },
    });
    expect(saved).toEqual({ name: "Ada", email: "", slackWebhookUrl: "https://hooks.slack.com/services/T/B/x" });
    expect(api.storage.local.items.get(SETTINGS_KEY)).toEqual(saved);

    const refused = await handle(
      { type: "settings:set", settings: { name: "", email: "", slackWebhookUrl: "https://evil.example/hook" } },
      {},
    );
    expect(refused).toMatchObject({ ok: false, error: { kind: "invalid_settings" } });
    expect(api.storage.local.items.get(SETTINGS_KEY)).toEqual(saved);
  });

  it("captures the sender's window when its tab is in front", async () => {
    const { ok } = setup();
    const value = await ok({ type: "capture" }, { tab: { id: 5, active: true, windowId: 3 } });
    expect(value).toEqual({ dataUrl: "data:image/png;base64,window-3" });
  });

  it("refuses a capture for a tab that is not in front, or for no tab", async () => {
    const { handle } = setup();
    expect(await handle({ type: "capture" }, { tab: { id: 5, active: false, windowId: 3 } })).toMatchObject({
      ok: false,
    });
    expect(await handle({ type: "capture" }, {})).toMatchObject({ ok: false });
  });

  it("switches a tab on and off and reports its state", async () => {
    const { api, handle, ok } = setup();

    expect(await ok({ type: "tab:get", tabId: 4 })).toEqual({ enabled: false });
    expect(await ok({ type: "tab:set", tabId: 4, enabled: true })).toEqual({ enabled: true });
    expect(await ok({ type: "tab:get", tabId: 4 })).toEqual({ enabled: true });
    expect(await ok({ type: "tab:set", tabId: 4, enabled: false })).toEqual({ enabled: false });

    api.blocked.add(8);
    expect(await handle({ type: "tab:set", tabId: 8, enabled: true }, {})).toMatchObject({
      ok: false,
      error: { message: "SitePing can't run on this page." },
    });
  });

  it("counts feedback per site, open ones apart", async () => {
    const { ok } = setup();
    const a = await ok<{ id: string }>({
      type: "feedback:create",
      input: createInput({ projectName: "https://a.example" }),
    });
    await ok({ type: "feedback:create", input: createInput({ projectName: "https://a.example" }) });
    await ok({ type: "feedback:create", input: createInput({ projectName: "https://b.example" }) });
    await ok({ type: "feedback:status", id: a.id, status: "resolved" });

    const stats = await ok<{ projectName: string }[]>({ type: "stats" });

    expect([...stats].sort((x, y) => x.projectName.localeCompare(y.projectName))).toEqual([
      { projectName: "https://a.example", total: 2, open: 1 },
      { projectName: "https://b.example", total: 1, open: 1 },
    ]);
  });
});
