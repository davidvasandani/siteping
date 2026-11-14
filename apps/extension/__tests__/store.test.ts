import { isStoreDuplicate, isStoreNotFound, isStorePersistence, toFeedbackUpdate } from "@siteping/core";
import { describe, expect, it } from "vitest";
import { createExtensionStore } from "../src/background/store.js";
import { feedbackKey, readAllRecords } from "../src/shared/records.js";
import { createFakeApi } from "./fake-api.js";
import { createInput, TINY_JPEG_DATA_URL } from "./fixtures.js";

const setup = () => {
  const { local } = createFakeApi().storage;
  return { local, store: createExtensionStore(local) };
};

describe("createExtensionStore", () => {
  it("stores each feedback under its own key", async () => {
    const { local, store } = setup();
    const first = await store.createFeedback(createInput());
    const second = await store.createFeedback(createInput());

    expect([...local.items.keys()].sort()).toEqual([feedbackKey(first.id), feedbackKey(second.id)].sort());
  });

  it("writes only the record a mutation changed", async () => {
    const { local, store } = setup();
    const first = await store.createFeedback(createInput({ screenshotDataUrl: TINY_JPEG_DATA_URL }));
    const second = await store.createFeedback(createInput());
    local.writes.length = 0;

    await store.updateFeedback(second.id, toFeedbackUpdate("resolved"));
    await store.addComment(first.id, {
      body: "Seen",
      authorName: "Bo",
      authorEmail: "",
      authorRole: "client",
      clientId: "c1",
    });

    expect(local.writes).toEqual([[feedbackKey(second.id)], [feedbackKey(first.id)]]);
  });

  it("removes the key of a deleted feedback and nothing else", async () => {
    const { local, store } = setup();
    const kept = await store.createFeedback(createInput());
    const gone = await store.createFeedback(createInput());
    local.writes.length = 0;

    await store.deleteFeedback(gone.id);

    expect(local.removals).toEqual([[feedbackKey(gone.id)]]);
    expect(local.writes).toEqual([]);
    expect((await store.all()).map((record) => record.id)).toEqual([kept.id]);
  });

  it("deletes one site's feedback and leaves the others", async () => {
    const { store } = setup();
    await store.createFeedback(createInput({ projectName: "https://a.example" }));
    const other = await store.createFeedback(createInput({ projectName: "https://b.example" }));

    await store.deleteAllFeedbacks("https://a.example");

    expect((await store.all()).map((record) => record.id)).toEqual([other.id]);
  });

  it("keeps both feedback when two clients create at the same moment", async () => {
    const { local, store } = setup();

    const [a, b] = await Promise.all([
      store.createFeedback(createInput({ message: "from tab one" })),
      store.createFeedback(createInput({ message: "from tab two" })),
    ]);

    const stored = await readAllRecords(local);
    expect(stored.map((record) => record.id).sort()).toEqual([a.id, b.id].sort());
    expect(stored.map((record) => record.message).sort()).toEqual(["from tab one", "from tab two"]);
  });

  it("reports a repeated clientId as a duplicate", async () => {
    const { store } = setup();
    const input = createInput();
    await store.createFeedback(input);

    await expect(store.createFeedback(input)).rejects.toSatisfy(isStoreDuplicate);
    expect((await store.findByClientId(input.clientId))?.message).toBe(input.message);
  });

  it("reports a missing feedback as not found", async () => {
    const { store } = setup();
    await expect(store.deleteFeedback("nope")).rejects.toSatisfy(isStoreNotFound);
  });

  it("keeps the text without its screenshot when storage refuses the screenshot", async () => {
    const { local, store } = setup();
    local.maxBytes = 2000;
    const big = `data:image/jpeg;base64,${"A".repeat(5000)}`;

    const record = await store.createFeedback(createInput({ message: "Still saved", screenshotDataUrl: big }));

    expect(record.screenshotUrl).toBeNull();
    const [stored] = await readAllRecords(local);
    expect(stored?.message).toBe("Still saved");
    expect(stored?.screenshotUrl).toBeNull();
  });

  it("fails loudly, and stores nothing, when storage refuses the text too", async () => {
    const { local, store } = setup();
    local.failSets = 2;

    await expect(store.createFeedback(createInput())).rejects.toSatisfy(isStorePersistence);

    expect(local.items.size).toBe(0);
    expect(await store.all()).toEqual([]);
  });

  it("recovers after a refused write", async () => {
    const { local, store } = setup();
    const kept = await store.createFeedback(createInput());
    local.failSets = 1;
    await expect(store.updateFeedback(kept.id, toFeedbackUpdate("resolved"))).rejects.toSatisfy(isStorePersistence);

    const updated = await store.updateFeedback(kept.id, toFeedbackUpdate("resolved"));

    expect(updated.status).toBe("resolved");
    expect((await readAllRecords(local))[0]?.status).toBe("resolved");
  });

  it("reads what a previous background instance stored", async () => {
    const { local, store } = setup();
    const record = await store.createFeedback(createInput({ message: "Before restart" }));

    const restarted = createExtensionStore(local);

    const page = await restarted.getFeedbacks({ projectName: record.projectName });
    expect(page.feedbacks.map((feedback) => feedback.message)).toEqual(["Before restart"]);
    expect(page.feedbacks[0]?.createdAt).toBeInstanceOf(Date);
  });

  it("leaves an unreadable entry in storage through later writes", async () => {
    const { local, store } = setup();
    await local.set({ [feedbackKey("damaged")]: { id: 7 } });

    const record = await store.createFeedback(createInput());
    await store.deleteFeedback(record.id);

    expect(local.items.has(feedbackKey("damaged"))).toBe(true);
  });

  it("lists newest first", async () => {
    const { store } = setup();
    const first = await store.createFeedback(createInput());
    const second = await store.createFeedback(createInput());

    const { feedbacks } = await store.getFeedbacks({ projectName: first.projectName });
    expect(feedbacks.map((feedback) => feedback.id)).toEqual([second.id, first.id]);
  });
});
