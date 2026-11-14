import { describe, expect, it } from "vitest";
import { feedbackKey, readAllRecords, reviveRecord, serializeRecord } from "../src/shared/records.js";
import { createFakeApi } from "./fake-api.js";
import { createRecord } from "./fixtures.js";

describe("serializeRecord / reviveRecord", () => {
  it("round-trips a record, dates included", () => {
    const record = createRecord({ message: "Broken button" });
    record.resolvedAt = new Date("2026-11-15T08:00:00Z");
    record.comments = [
      {
        id: "c1",
        feedbackId: record.id,
        body: "On it",
        authorName: "Bo",
        authorEmail: "",
        authorRole: "client",
        clientId: "cc1",
        createdAt: new Date("2026-11-14T12:00:00Z"),
      },
    ];

    const stored = serializeRecord(record);
    expect(typeof stored.createdAt).toBe("string");
    expect(reviveRecord(stored)).toEqual(record);
  });

  it("revives a record written before threads existed with an empty thread", () => {
    const { comments: _comments, ...stored } = serializeRecord(createRecord());
    expect(reviveRecord(stored)?.comments).toEqual([]);
  });

  it.each([
    ["null", null],
    ["a string", "fb"],
    ["an object without id", { createdAt: "2026-11-14T10:00:00Z" }],
    ["a bad date", { ...serializeRecord(createRecord()), createdAt: "yesterday" }],
    ["no annotation list", { ...serializeRecord(createRecord()), annotations: null }],
  ])("refuses %s", (_label, value) => {
    expect(reviveRecord(value)).toBeNull();
  });
});

describe("readAllRecords", () => {
  it("returns feedback newest first and ignores other keys", async () => {
    const { local } = createFakeApi().storage;
    const older = createRecord({}, new Date("2026-11-01T00:00:00Z"));
    const newer = createRecord({}, new Date("2026-11-10T00:00:00Z"));
    await local.set({
      [feedbackKey(older.id)]: serializeRecord(older),
      [feedbackKey(newer.id)]: serializeRecord(newer),
      settings: { name: "Ada" },
    });

    expect((await readAllRecords(local)).map((record) => record.id)).toEqual([newer.id, older.id]);
  });

  it("skips an unreadable entry and leaves it in storage", async () => {
    const { local } = createFakeApi().storage;
    const good = createRecord();
    await local.set({ [feedbackKey(good.id)]: serializeRecord(good), [feedbackKey("damaged")]: { id: 7 } });

    expect((await readAllRecords(local)).map((record) => record.id)).toEqual([good.id]);
    expect(local.items.has(feedbackKey("damaged"))).toBe(true);
  });
});
