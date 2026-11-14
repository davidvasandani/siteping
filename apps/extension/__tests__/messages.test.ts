import {
  isStoreDuplicate,
  isStoreLimit,
  isStoreNotFound,
  isStorePersistence,
  StoreDuplicateError,
  StoreLimitError,
  StoreNotFoundError,
  StorePersistenceError,
} from "@siteping/core";
import { describe, expect, it } from "vitest";
import { call, fromWireError, toWireError } from "../src/shared/messages.js";
import { InvalidSettingsError } from "../src/shared/settings.js";
import { createFakeApi } from "./fake-api.js";

describe("wire errors", () => {
  it.each([
    ["duplicate", new StoreDuplicateError("dup"), isStoreDuplicate],
    ["not_found", new StoreNotFoundError("gone"), isStoreNotFound],
    ["limit", new StoreLimitError("full"), isStoreLimit],
    ["persistence", new StorePersistenceError("quota"), isStorePersistence],
  ] as const)("carries a %s store error across a message", (kind, error, guard) => {
    const wire = JSON.parse(JSON.stringify(toWireError(error)));
    expect(wire).toEqual({ kind, message: error.message });
    expect(guard(fromWireError(wire))).toBe(true);
  });

  it("carries a settings error and anything else by its message", () => {
    expect(fromWireError(toWireError(new InvalidSettingsError("bad")))).toBeInstanceOf(InvalidSettingsError);
    expect(toWireError(new TypeError("boom"))).toEqual({ kind: "other", message: "boom" });
    expect(toWireError("plain")).toEqual({ kind: "other", message: "plain" });
    expect(fromWireError({ kind: "other", message: "boom" }).message).toBe("boom");
  });
});

describe("call", () => {
  it("resolves with the value of an ok reply", async () => {
    const api = createFakeApi();
    api.runtime.onMessage.addListener((_message, _sender, respond) => {
      respond({ ok: true, value: { enabled: true } });
      return undefined;
    });
    await expect(call(api, { type: "tab:get", tabId: 1 })).resolves.toEqual({ enabled: true });
  });

  it("rejects with the error the background reported", async () => {
    const api = createFakeApi();
    api.runtime.onMessage.addListener((_message, _sender, respond) => {
      respond({ ok: false, error: { kind: "not_found", message: "gone" } });
      return undefined;
    });
    await expect(call(api, { type: "feedback:delete", id: "x" })).rejects.toSatisfy(isStoreNotFound);
  });

  it("rejects when nothing answered", async () => {
    await expect(call(createFakeApi(), { type: "stats" })).rejects.toThrow(/did not answer/);
  });
});
