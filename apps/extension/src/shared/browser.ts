/**
 * The slice of the WebExtension API the extension uses, as a port.
 *
 * Every module takes the part it needs as an argument instead of reaching for
 * the `chrome` global, so the unit tests run them over an in-memory fake
 * (`__tests__/fake-api.ts`). `extensionApi()` is the one place the real
 * global is read; its `return` is also where TypeScript checks this port
 * against `@types/chrome`, so a signature written wrong here fails `tsc`.
 *
 * Only promise-returning forms are declared: Chrome's Manifest V3 and
 * Safari's `browser` namespace both return promises when no callback is
 * passed.
 */

export interface StorageArea {
  /** `null` reads every key of the area. */
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export interface TabInfo {
  id?: number | undefined;
  url?: string | undefined;
  active?: boolean | undefined;
  windowId?: number | undefined;
}

export interface MessageSender {
  /** Id of the extension that sent the message. */
  id?: string | undefined;
  /** Set when the sender is a content script. */
  tab?: TabInfo | undefined;
}

export interface TabChange {
  status?: string | undefined;
  url?: string | undefined;
}

/** `true` keeps the channel open for a `sendResponse` called later. */
export type MessageListener = (
  message: unknown,
  sender: MessageSender,
  sendResponse: (response: unknown) => void,
) => boolean | undefined;

export interface ExtensionApi {
  runtime: {
    id: string;
    getURL(path: string): string;
    sendMessage(message: unknown): Promise<unknown>;
    onMessage: { addListener(listener: MessageListener): void };
  };
  storage: {
    local: StorageArea;
    session: StorageArea;
    onChanged: {
      addListener(listener: (changes: Record<string, unknown>, areaName: string) => void): void;
    };
  };
  tabs: {
    query(query: { active: boolean; currentWindow: boolean }): Promise<TabInfo[]>;
    get(tabId: number): Promise<TabInfo>;
    create(properties: { url: string }): Promise<TabInfo>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
    captureVisibleTab(windowId: number, options: { format: "png" }): Promise<string>;
    onUpdated: { addListener(listener: (tabId: number, change: TabChange, tab: TabInfo) => void): void };
    onRemoved: { addListener(listener: (tabId: number) => void): void };
  };
  scripting: {
    executeScript(injection: { target: { tabId: number }; files: string[] }): Promise<unknown>;
  };
  permissions: {
    contains(permissions: { origins: string[] }): Promise<boolean>;
    request(permissions: { origins: string[] }): Promise<boolean>;
  };
  action: {
    setBadgeText(details: { tabId: number; text: string }): Promise<void>;
    setBadgeBackgroundColor(details: { tabId: number; color: string }): Promise<void>;
  };
  commands: {
    onCommand: { addListener(listener: (command: string, tab?: TabInfo) => void): void };
  };
}

/** What a content script may use: it has no `tabs`, `scripting` or `permissions`. */
export type ContentApi = Pick<ExtensionApi, "runtime" | "storage">;

/**
 * The browser's extension API. Safari exposes it as `browser` (and aliases
 * `chrome`), Chrome as `chrome` only.
 */
export function extensionApi(): ExtensionApi {
  const scope = globalThis as { browser?: typeof chrome; chrome?: typeof chrome };
  const api = scope.browser ?? scope.chrome;
  if (!api?.runtime?.id) throw new Error("SitePing: not running inside a browser extension");
  return api;
}
