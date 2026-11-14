import type {
  ExtensionApi,
  MessageListener,
  MessageSender,
  StorageArea,
  TabChange,
  TabInfo,
} from "../src/shared/browser.js";

/**
 * In-memory stand-in for the browser's extension API. Values go through JSON
 * on the way in and out, like the real storage and message channels, so a
 * test that passes a `Date` sees what production would.
 */

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class FakeStorageArea implements StorageArea {
  readonly items = new Map<string, unknown>();
  /** Keys of every `set`, in order: what a test reads to see which records were rewritten. */
  readonly writes: string[][] = [];
  readonly removals: string[][] = [];
  /** Make the next `set` calls reject, as a full disk or an exceeded quota does. */
  failSets = 0;
  /** Reject any `set` whose serialised form is longer than this, like a quota. */
  maxBytes = Number.POSITIVE_INFINITY;
  private readonly listeners: ((changes: Record<string, unknown>, areaName: string) => void)[];

  constructor(
    private readonly name: string,
    listeners: ((changes: Record<string, unknown>, areaName: string) => void)[],
  ) {
    this.listeners = listeners;
  }

  async get(keys: string | string[] | null): Promise<Record<string, unknown>> {
    const wanted = keys === null ? [...this.items.keys()] : typeof keys === "string" ? [keys] : keys;
    const found: Record<string, unknown> = {};
    for (const key of wanted) {
      if (this.items.has(key)) found[key] = json(this.items.get(key));
    }
    return found;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    if (this.failSets > 0) {
      this.failSets -= 1;
      throw new Error("QUOTA_BYTES quota exceeded");
    }
    if (JSON.stringify(items).length > this.maxBytes) throw new Error("QUOTA_BYTES quota exceeded");
    this.writes.push(Object.keys(items));
    for (const [key, value] of Object.entries(items)) this.items.set(key, json(value));
    this.emit(Object.keys(items));
  }

  async remove(keys: string | string[]): Promise<void> {
    const list = typeof keys === "string" ? [keys] : keys;
    this.removals.push(list);
    for (const key of list) this.items.delete(key);
    this.emit(list);
  }

  private emit(keys: string[]): void {
    const changes = Object.fromEntries(keys.map((key) => [key, {}]));
    for (const listener of this.listeners) listener(changes, this.name);
  }
}

export interface FakeApi extends ExtensionApi {
  storage: ExtensionApi["storage"] & { local: FakeStorageArea; session: FakeStorageArea };
  /** Tabs the fake knows; `captureVisibleTab` and `get` read from here. */
  tabList: Map<number, TabInfo>;
  /** Tab ids `executeScript` refuses, as a page the extension has no access to. */
  blocked: Set<number>;
  injected: number[];
  /** Messages sent to content scripts with `tabs.sendMessage`. */
  sentToTabs: { tabId: number; message: unknown }[];
  /** Tab ids without a content script: `tabs.sendMessage` rejects for them. */
  deaf: Set<number>;
  badges: Map<number, string>;
  /** Origins `permissions.contains` reports as granted. */
  granted: Set<string>;
  /** What `permissions.request` answers. */
  grantOnRequest: boolean;
  /** Deliver a message to the registered `runtime.onMessage` listeners, as `sender`. */
  deliver(message: unknown, sender?: MessageSender): Promise<unknown>;
  emitTabUpdated(tabId: number, change: TabChange): void;
  emitTabRemoved(tabId: number): void;
  emitCommand(command: string, tab?: TabInfo): void;
}

export function createFakeApi(): FakeApi {
  const storageListeners: ((changes: Record<string, unknown>, areaName: string) => void)[] = [];
  const messageListeners: MessageListener[] = [];
  const updatedListeners: ((tabId: number, change: TabChange, tab: TabInfo) => void)[] = [];
  const removedListeners: ((tabId: number) => void)[] = [];
  const commandListeners: ((command: string, tab?: TabInfo) => void)[] = [];
  let offscreenOpen = false;
  let nextTabId = 100;

  const deliver = (message: unknown, sender: MessageSender = { id: "fake-extension" }): Promise<unknown> =>
    new Promise((resolve) => {
      let answered = false;
      const respond = (response: unknown): void => {
        answered = true;
        resolve(json(response));
      };
      const kept = messageListeners.map((listener) => listener(json(message), sender, respond));
      // No listener kept the channel open and none answered: the sender gets
      // `undefined`, as from the real API.
      if (!answered && !kept.includes(true)) resolve(undefined);
    });

  const api: FakeApi = {
    runtime: {
      id: "fake-extension",
      getURL: (path) => `chrome-extension://fake-extension/${path}`,
      sendMessage: (message) => deliver(message),
      onMessage: { addListener: (listener) => void messageListeners.push(listener) },
      getContexts: async () => (offscreenOpen ? [{}] : []),
    },
    storage: {
      local: new FakeStorageArea("local", storageListeners),
      session: new FakeStorageArea("session", storageListeners),
      onChanged: { addListener: (listener) => void storageListeners.push(listener) },
    },
    tabs: {
      query: async () => [...api.tabList.values()].filter((tab) => tab.active),
      get: async (tabId) => {
        const tab = api.tabList.get(tabId);
        if (!tab) throw new Error(`No tab with id: ${tabId}`);
        return tab;
      },
      create: async ({ url }) => {
        const tab: TabInfo = { id: nextTabId++, url, active: true, windowId: 1 };
        api.tabList.set(tab.id as number, tab);
        return tab;
      },
      sendMessage: async (tabId, message) => {
        if (api.deaf.has(tabId)) throw new Error("Could not establish connection. Receiving end does not exist.");
        api.sentToTabs.push({ tabId, message: json(message) });
        return undefined;
      },
      captureVisibleTab: async (windowId) => `data:image/png;base64,window-${windowId}`,
      onUpdated: { addListener: (listener) => void updatedListeners.push(listener) },
      onRemoved: { addListener: (listener) => void removedListeners.push(listener) },
    },
    scripting: {
      executeScript: async ({ target }) => {
        if (api.blocked.has(target.tabId)) throw new Error("Cannot access contents of the page.");
        api.injected.push(target.tabId);
        return [];
      },
    },
    permissions: {
      contains: async ({ origins }) => origins.every((origin) => api.granted.has(origin)),
      request: async ({ origins }) => {
        if (api.grantOnRequest) for (const origin of origins) api.granted.add(origin);
        return api.grantOnRequest;
      },
    },
    action: {
      setBadgeText: async ({ tabId, text }) => void api.badges.set(tabId, text),
      setBadgeBackgroundColor: async () => {},
    },
    commands: { onCommand: { addListener: (listener) => void commandListeners.push(listener) } },
    offscreen: {
      createDocument: async () => {
        offscreenOpen = true;
      },
      closeDocument: async () => {
        offscreenOpen = false;
      },
    },
    tabCapture: { getMediaStreamId: async ({ targetTabId }) => `fake-stream-${targetTabId}` },
    tabList: new Map(),
    blocked: new Set(),
    injected: [],
    sentToTabs: [],
    deaf: new Set(),
    badges: new Map(),
    granted: new Set(),
    grantOnRequest: true,
    deliver,
    emitTabUpdated: (tabId, change) => {
      for (const listener of updatedListeners) listener(tabId, change, api.tabList.get(tabId) ?? { id: tabId });
    },
    emitTabRemoved: (tabId) => {
      for (const listener of removedListeners) listener(tabId);
    },
    emitCommand: (command, tab) => {
      for (const listener of commandListeners) listener(command, tab);
    },
  };
  return api;
}
