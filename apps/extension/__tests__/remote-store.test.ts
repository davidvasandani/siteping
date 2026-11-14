import { isStoreDuplicate, isStoreNotFound, toFeedbackUpdate } from "@siteping/core";
import { describe, expect, it } from "vitest";
import { createHandler } from "../src/background/handler.js";
import { createExtensionStore } from "../src/background/store.js";
import { createTabController } from "../src/background/tabs.js";
import { createRemoteStore } from "../src/content/remote-store.js";
import { createFakeApi } from "./fake-api.js";
import { createInput } from "./fixtures.js";

/** A page-side store wired to a real background handler through the fake message channel. */
const setup = () => {
  const api = createFakeApi();
  const handle = createHandler({ api, store: createExtensionStore(api.storage.local), tabs: createTabController(api) });
  api.runtime.onMessage.addListener((message, sender, respond) => {
    void handle(message, sender).then(respond);
    return true;
  });
  return { api, store: createRemoteStore(api) };
};

describe("createRemoteStore", () => {
  it("creates and reads back a feedback with real dates", async () => {
    const { store } = setup();
    const input = createInput({ message: "Across the wire" });

    const created = await store.createFeedback(input);
    const { feedbacks, total } = await store.getFeedbacks({ projectName: input.projectName });

    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.annotations[0]?.createdAt).toBeInstanceOf(Date);
    expect(total).toBe(1);
    expect(feedbacks[0]).toEqual(created);
    expect(await store.findByClientId(input.clientId)).toEqual(created);
    expect(await store.findByClientId("unknown")).toBeNull();
  });

  it("filters by page like any store", async () => {
    const { store } = setup();
    await store.createFeedback(createInput({ url: "/a" }));
    await store.createFeedback(createInput({ url: "/b" }));

    const { feedbacks } = await store.getFeedbacks({ projectName: "https://example.com", url: "/b" });

    expect(feedbacks.map((feedback) => feedback.url)).toEqual(["/b"]);
  });

  it("resolves and reopens, with the closure date derived by the background", async () => {
    const { store } = setup();
    const { id } = await store.createFeedback(createInput());

    const resolved = await store.updateFeedback(id, toFeedbackUpdate("resolved"));
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedAt).toBeInstanceOf(Date);

    const reopened = await store.updateFeedback(id, toFeedbackUpdate("open"));
    expect(reopened.resolvedAt).toBeNull();
  });

  it("rethrows the store errors the widget tells apart", async () => {
    const { store } = setup();
    const input = createInput();
    await store.createFeedback(input);

    await expect(store.createFeedback(input)).rejects.toSatisfy(isStoreDuplicate);
    await expect(store.deleteFeedback("missing")).rejects.toSatisfy(isStoreNotFound);
  });

  it("adds a reply, verifies ownership and deletes", async () => {
    const { store } = setup();
    const record = await store.createFeedback(createInput());

    const comment = await store.addComment?.(record.id, {
      body: "Noted",
      authorName: "Bo",
      authorEmail: "",
      authorRole: "client",
      clientId: "c1",
    });
    expect(comment?.createdAt).toBeInstanceOf(Date);
    expect((await store.findByClientId(record.clientId))?.comments).toHaveLength(1);

    expect(await store.verifyProjectOwnership(record.id, record.projectName)).toBe(true);
    expect(await store.verifyProjectOwnership(record.id, "https://other.example")).toBe(false);

    await store.deleteFeedback(record.id);
    await store.createFeedback(createInput());
    await store.deleteAllFeedbacks(record.projectName);
    expect((await store.getFeedbacks({ projectName: record.projectName })).total).toBe(0);
  });
});
