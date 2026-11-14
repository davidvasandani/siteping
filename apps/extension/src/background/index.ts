import { extensionApi } from "../shared/browser.js";
import { createHandler } from "./handler.js";
import { createExtensionStore } from "./store.js";
import { createTabController } from "./tabs.js";

/**
 * Background entry: a service worker in Chrome, a non-persistent page in
 * Safari. Both are stopped when idle and started again for the next event,
 * so listeners are registered synchronously here and nothing below keeps
 * state that is not also in storage.
 */

const TOGGLE_COMMAND = "toggle-siteping";

const api = extensionApi();
const tabs = createTabController(api);
const handle = createHandler({ api, store: createExtensionStore(api.storage.local), tabs });

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only this extension's own pages and content scripts are served.
  if (sender.id !== api.runtime.id) return undefined;
  void handle(message, sender).then(sendResponse);
  return true;
});

api.tabs.onUpdated.addListener((tabId, change) => void tabs.handleUpdated(tabId, change));
api.tabs.onRemoved.addListener((tabId) => void tabs.handleRemoved(tabId));

api.commands.onCommand.addListener((command, tab) => {
  if (command !== TOGGLE_COMMAND) return;
  void (async () => {
    // Safari does not pass the tab; ask for the one in front.
    const target = tab?.id ?? (await api.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    // A page the extension cannot run on: the shortcut has nothing to show an error in.
    if (target !== undefined) await tabs.toggle(target).catch(() => {});
  })();
});
