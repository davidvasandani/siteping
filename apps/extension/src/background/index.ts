import { extensionApi } from "../shared/browser.js";
import { pageScopeUrl } from "../shared/scope.js";
import { createHandler } from "./handler.js";
import { createRecordingCoordinator } from "./recording.js";
import { createExtensionStore } from "./store.js";
import { createTabController } from "./tabs.js";

/**
 * Background entry: a service worker in Chrome, a non-persistent page in
 * Safari. Both are stopped when idle and started again for the next event,
 * so listeners are registered synchronously here and nothing below keeps
 * state that is not also in storage.
 */

const TOGGLE_COMMAND = "toggle-siteping";
const RECORD_COMMAND = "record-siteping";

const api = extensionApi();
const tabs = createTabController(api);
const store = createExtensionStore(api.storage.local);
const recording = createRecordingCoordinator(api, store, tabs);
const handle = createHandler({ api, store, tabs, recording });

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only this extension's own pages, offscreen document and content scripts are served.
  if (sender.id !== api.runtime.id) return undefined;
  const addressed = message as { target?: string; type?: string; state?: unknown };
  if (addressed?.target === "offscreen") return undefined;
  if (addressed?.target === "background" && addressed.type === "recording:offscreen-finished") {
    void recording.finished(addressed.state as never);
    return undefined;
  }
  void handle(message, sender).then(sendResponse);
  return true;
});

api.tabs.onUpdated.addListener((tabId, change) => void tabs.handleUpdated(tabId, change));
api.tabs.onRemoved.addListener((tabId) => void tabs.handleRemoved(tabId));

api.commands.onCommand.addListener((command, tab) => {
  if (command !== TOGGLE_COMMAND && command !== RECORD_COMMAND) return;
  void (async () => {
    // Safari does not pass the tab; ask for the one in front.
    const target = tab?.id ?? (await api.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    // A page the extension cannot run on: the shortcut has nothing to show an error in.
    if (target === undefined) return;
    if (command === TOGGLE_COMMAND) {
      await tabs.toggle(target).catch(() => {});
      return;
    }
    const current = await recording.state().catch(() => ({ phase: "idle" }) as const);
    if (current.phase !== "idle") {
      await recording.stop("manual").catch(() => {});
      return;
    }
    const targetTab = tab?.url ? tab : await api.tabs.get(target);
    if (!targetTab.url?.startsWith("http")) return;
    const address = new URL(targetTab.url);
    const candidates = await store.getFeedbacks({ projectName: address.origin, url: pageScopeUrl(address), limit: 2 });
    const [candidate] = candidates.feedbacks;
    if (candidates.feedbacks.length === 1 && candidate) await recording.start(target, candidate.id).catch(() => {});
    else await api.action.setBadgeText({ tabId: target, text: "!" });
  })();
});
