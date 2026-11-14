import type { ExtensionApi, TabChange } from "../shared/browser.js";
import { ACCENT } from "../shared/labels.js";
import type { ContentMessage } from "../shared/messages.js";

const TABS_KEY = "tabs";
const CONTENT_SCRIPT = "content.js";

/** The page refused the content script: a browser page, a store page, or a tab whose access has ended. */
export class CannotRunError extends Error {
  constructor(options?: ErrorOptions) {
    super("SitePing can't run on this page.", options);
    this.name = "CannotRunError";
  }
}

export interface TabController {
  isEnabled(tabId: number): Promise<boolean>;
  /** Switch SitePing on in the tab. Rejects with `CannotRunError` where the browser refuses. */
  enable(tabId: number): Promise<void>;
  disable(tabId: number): Promise<void>;
  /** Flip the tab's state and resolve with the new one. */
  toggle(tabId: number): Promise<boolean>;
  handleUpdated(tabId: number, change: TabChange): Promise<void>;
  handleRemoved(tabId: number): Promise<void>;
}

/**
 * Which tabs have SitePing switched on, and keeping it on as they navigate.
 *
 * The extension holds no access to any site. The reviewer's click on the
 * toolbar button (or the shortcut) grants `activeTab` for that tab, which the
 * browser keeps while the tab stays on the same site. So a navigation inside
 * the site only needs the content script injected again, and a navigation
 * away ends the grant: the injection is refused and the tab is switched off.
 *
 * The set lives in `storage.session`, not in a variable: the browser stops an
 * idle background and starts a new one for the next event.
 */
export function createTabController(
  api: Pick<ExtensionApi, "storage" | "scripting" | "tabs" | "action">,
): TabController {
  const area = api.storage.session;

  // Events for two tabs can interleave between the read and the write of the
  // set. One at a time, so neither drops the other's change.
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task, task);
    queue = result.catch(() => {});
    return result;
  };

  const read = async (): Promise<Set<number>> => {
    const stored = (await area.get(TABS_KEY))[TABS_KEY];
    return new Set(Array.isArray(stored) ? stored.filter((id): id is number => typeof id === "number") : []);
  };
  const write = (tabs: Set<number>): Promise<void> => area.set({ [TABS_KEY]: [...tabs] });

  const inject = async (tabId: number): Promise<void> => {
    try {
      await api.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
    } catch (cause) {
      throw new CannotRunError({ cause });
    }
  };

  /** The toolbar badge is decoration: a browser that refuses it must not undo the switch. */
  const badge = async (tabId: number, on: boolean): Promise<void> => {
    try {
      await api.action.setBadgeText({ tabId, text: on ? "ON" : "" });
      if (on) await api.action.setBadgeBackgroundColor({ tabId, color: ACCENT });
    } catch {
      // The tab is gone, or the browser has no per-tab badge.
    }
  };

  /** A tab without the content script (reloading, closed) has nobody to tell. */
  const tell = async (tabId: number, message: ContentMessage): Promise<void> => {
    try {
      await api.tabs.sendMessage(tabId, message);
    } catch {
      // No receiver.
    }
  };

  const forget = async (tabId: number): Promise<void> => {
    const tabs = await read();
    if (tabs.delete(tabId)) await write(tabs);
  };

  const enable = (tabId: number): Promise<void> =>
    exclusive(async () => {
      await inject(tabId);
      const tabs = await read();
      if (!tabs.has(tabId)) await write(tabs.add(tabId));
      await badge(tabId, true);
    });

  const disable = (tabId: number): Promise<void> =>
    exclusive(async () => {
      await forget(tabId);
      await tell(tabId, { type: "unmount" });
      await badge(tabId, false);
    });

  const isEnabled = async (tabId: number): Promise<boolean> => (await read()).has(tabId);

  return {
    isEnabled,
    enable,
    disable,

    async toggle(tabId) {
      const on = !(await isEnabled(tabId));
      await (on ? enable(tabId) : disable(tabId));
      return on;
    },

    handleUpdated: (tabId, change) =>
      exclusive(async () => {
        if (!(await read()).has(tabId)) return;
        if (change.status === "complete") {
          // A finished load: a new document without the widget, or the same
          // one, where the script's own guard makes this a no-op.
          try {
            await inject(tabId);
            await badge(tabId, true);
          } catch {
            await forget(tabId);
          }
        } else if (change.url !== undefined) {
          // The address changed without a load (`history.pushState`). The
          // widget's own History patch lives in the content script's world
          // and never sees the page's call, so it is told from here.
          await tell(tabId, { type: "navigated" });
        }
      }),

    handleRemoved: (tabId) => exclusive(() => forget(tabId)),
  };
}
