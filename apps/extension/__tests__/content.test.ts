// @vitest-environment jsdom
import type { SitepingConfig, SitepingInstance } from "@siteping/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createController } from "../src/content/controller.js";
import { SETTINGS_KEY } from "../src/shared/settings.js";
import { createFakeApi } from "./fake-api.js";

const setup = () => {
  const api = createFakeApi();
  const instance = { destroy: vi.fn(), refresh: vi.fn(async () => {}) } as unknown as SitepingInstance;
  const init = vi.fn((_config: SitepingConfig) => instance);
  return { api, instance, init, controller: createController(api, init) };
};

beforeEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/pricing?id=5&utm_source=mail&siteping=abc");
});

describe("createController", () => {
  it("mounts the widget in store mode for this site and page", async () => {
    const { controller, init } = setup();

    await controller.mount();

    const config = init.mock.calls[0]?.[0] as SitepingConfig;
    expect(config).toMatchObject({
      projectName: window.location.origin,
      forceShow: true,
      enableScreenshot: true,
      deepLink: true,
      theme: "auto",
      position: "bottom-right",
      identity: { name: "Reviewer", email: "" },
    });
    expect(config.store).toBeDefined();
    expect(config.getPageScope?.()).toEqual({ url: "/pricing?id=5", urlPattern: null });
  });

  it("uses the reviewer's identity from the settings", async () => {
    const { api, controller, init } = setup();
    await api.storage.local.set({ [SETTINGS_KEY]: { name: "Ada", email: "ada@example.com", slackWebhookUrl: "" } });

    await controller.mount();

    expect(init.mock.calls[0]?.[0].identity).toEqual({ name: "Ada", email: "ada@example.com" });
  });

  it("moves aside on a site that already embeds SitePing", async () => {
    const { controller, init } = setup();
    document.body.append(document.createElement("siteping-widget"));

    await controller.mount();

    expect(init.mock.calls[0]?.[0].position).toBe("bottom-left");
  });

  it("mounts once however often the script is injected", async () => {
    const { controller, init } = setup();

    await Promise.all([controller.mount(), controller.mount()]);
    await controller.mount();

    expect(init).toHaveBeenCalledTimes(1);
  });

  it("unmounts, and can mount again", async () => {
    const { controller, init, instance } = setup();
    await controller.mount();

    controller.unmount();
    expect(instance.destroy).toHaveBeenCalledTimes(1);

    await controller.mount();
    expect(init).toHaveBeenCalledTimes(2);
  });

  it("does not mount when switched off while it was starting", async () => {
    const { controller, init } = setup();

    const mounting = controller.mount();
    controller.unmount();
    await mounting;

    expect(init).not.toHaveBeenCalled();
  });

  it("refreshes the widget on an address change, and ignores one before it is mounted", async () => {
    const { controller, instance } = setup();

    controller.refresh();
    expect(instance.refresh).not.toHaveBeenCalled();

    await controller.mount();
    controller.refresh();
    expect(instance.refresh).toHaveBeenCalledTimes(1);
  });
});
