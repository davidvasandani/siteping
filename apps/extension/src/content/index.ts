import { initSiteping } from "@siteping/widget";
import { extensionApi } from "../shared/browser.js";
import type { ContentMessage } from "../shared/messages.js";
import { type Controller, createController } from "./controller.js";

/**
 * Content script entry, injected by the background into a tab the reviewer
 * switched SitePing on for. It can run more than once in a document (the
 * background injects after every completed load), so the controller is kept
 * on the isolated world's global and reused.
 */
const scope = globalThis as { __sitepingExtension?: Controller };

if (!scope.__sitepingExtension) {
  const api = extensionApi();
  const controller = createController(api, initSiteping);
  scope.__sitepingExtension = controller;

  api.runtime.onMessage.addListener((message) => {
    const type = (message as ContentMessage | null)?.type;
    if (type === "unmount") controller.unmount();
    else if (type === "navigated") controller.refresh();
    return undefined;
  });
}

void scope.__sitepingExtension.mount();
