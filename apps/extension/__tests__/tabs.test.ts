import { describe, expect, it } from "vitest";
import { CannotRunError, createTabController } from "../src/background/tabs.js";
import { createFakeApi } from "./fake-api.js";

const setup = () => {
  const api = createFakeApi();
  return { api, tabs: createTabController(api) };
};

describe("createTabController", () => {
  it("injects the content script and remembers the tab", async () => {
    const { api, tabs } = setup();

    await tabs.enable(7);

    expect(api.injected).toEqual([7]);
    expect(await tabs.isEnabled(7)).toBe(true);
    expect(api.badges.get(7)).toBe("ON");
  });

  it("refuses a page the browser will not inject into, and remembers nothing", async () => {
    const { api, tabs } = setup();
    api.blocked.add(7);

    await expect(tabs.enable(7)).rejects.toBeInstanceOf(CannotRunError);

    expect(await tabs.isEnabled(7)).toBe(false);
  });

  it("switches off: forgets the tab and tells its content script to unmount", async () => {
    const { api, tabs } = setup();
    await tabs.enable(7);

    await tabs.disable(7);

    expect(await tabs.isEnabled(7)).toBe(false);
    expect(api.sentToTabs).toEqual([{ tabId: 7, message: { type: "unmount" } }]);
    expect(api.badges.get(7)).toBe("");
  });

  it("switches off a tab whose content script is already gone", async () => {
    const { api, tabs } = setup();
    await tabs.enable(7);
    api.deaf.add(7);

    await expect(tabs.disable(7)).resolves.toBeUndefined();
    expect(await tabs.isEnabled(7)).toBe(false);
  });

  it("toggles and reports the new state", async () => {
    const { tabs } = setup();
    expect(await tabs.toggle(7)).toBe(true);
    expect(await tabs.toggle(7)).toBe(false);
  });

  it("injects again when a switched-on tab finishes loading", async () => {
    const { api, tabs } = setup();
    await tabs.enable(7);

    await tabs.handleUpdated(7, { status: "loading", url: "https://example.com/next" });
    await tabs.handleUpdated(7, { status: "complete" });

    expect(api.injected).toEqual([7, 7]);
    expect(await tabs.isEnabled(7)).toBe(true);
  });

  it("switches the tab off when the next page refuses the script", async () => {
    const { api, tabs } = setup();
    await tabs.enable(7);
    api.blocked.add(7);

    await tabs.handleUpdated(7, { status: "complete" });

    expect(await tabs.isEnabled(7)).toBe(false);
  });

  it("tells the content script about an address change without a load", async () => {
    const { api, tabs } = setup();
    await tabs.enable(7);

    await tabs.handleUpdated(7, { url: "https://example.com/spa/route" });

    expect(api.sentToTabs).toEqual([{ tabId: 7, message: { type: "navigated" } }]);
    expect(api.injected).toEqual([7]);
  });

  it("ignores tabs that are not switched on", async () => {
    const { api, tabs } = setup();

    await tabs.handleUpdated(9, { status: "complete" });
    await tabs.handleUpdated(9, { url: "https://example.com/" });

    expect(api.injected).toEqual([]);
    expect(api.sentToTabs).toEqual([]);
  });

  it("forgets a closed tab", async () => {
    const { tabs } = setup();
    await tabs.enable(7);

    await tabs.handleRemoved(7);

    expect(await tabs.isEnabled(7)).toBe(false);
  });

  it("keeps every tab when several are switched on at once", async () => {
    const { tabs } = setup();

    await Promise.all([tabs.enable(1), tabs.enable(2), tabs.enable(3)]);

    expect(await Promise.all([1, 2, 3].map((id) => tabs.isEnabled(id)))).toEqual([true, true, true]);
  });

  it("survives a restart of the background", async () => {
    const { api, tabs } = setup();
    await tabs.enable(7);

    expect(await createTabController(api).isEnabled(7)).toBe(true);
  });
});
