import type { SitepingConfig, SitepingInstance } from "@siteping/core";
import type { ContentApi } from "../shared/browser.js";
import { call } from "../shared/messages.js";
import { pageScopeUrl, projectOf } from "../shared/scope.js";
import { FALLBACK_AUTHOR, readSettings } from "../shared/settings.js";
import { createRemoteStore } from "./remote-store.js";

export interface Controller {
  /** Show the widget. A second call while it is shown, or being shown, does nothing. */
  mount(): Promise<void>;
  /** Remove the widget from the page. */
  unmount(): void;
  /** The address changed without a load: show the feedback of the page now displayed. */
  refresh(): void;
  /**
   * The document came back from the back/forward cache, as it was when the
   * reviewer left it. SitePing may have been switched off since, on a later
   * page of the same tab: the background is asked, and the widget leaves if
   * so. Otherwise it reloads, since feedback may have changed meanwhile.
   */
  resume(): Promise<void>;
}

/**
 * The widget's life in one page. The background injects the content script
 * again after every load and may do so twice for one document; the entry
 * keeps a single controller per page so a repeat is a no-op.
 */
export function createController(api: ContentApi, init: (config: SitepingConfig) => SitepingInstance): Controller {
  let instance: SitepingInstance | null = null;
  /** Whether the widget should be showing: `mount` awaits, and an `unmount` can arrive meanwhile. */
  let wanted = false;

  return {
    async mount() {
      if (wanted) return;
      wanted = true;
      const settings = await readSettings(api.storage.local);
      if (!wanted || instance) return;
      instance = init({
        store: createRemoteStore(api),
        projectName: projectOf(window.location),
        // The widget hides itself on public pages unless told otherwise;
        // here the reviewer asked for it.
        forceShow: true,
        enableScreenshot: true,
        // Focus the feedback named in the address, which is how the review
        // page's "Open page" links arrive.
        deepLink: true,
        theme: "auto",
        locale: navigator.language,
        // A site that embeds SitePing already has its button bottom right.
        position: document.querySelector("siteping-widget") ? "bottom-left" : "bottom-right",
        // One identity for every site, from the extension's settings, so the
        // widget never asks per site.
        identity: { name: settings.name || FALLBACK_AUTHOR, email: settings.email },
        getPageScope: () => ({ url: pageScopeUrl(window.location), urlPattern: null }),
      });
    },

    unmount() {
      wanted = false;
      instance?.destroy();
      instance = null;
    },

    refresh() {
      void instance?.refresh();
    },

    async resume() {
      if (!instance) return;
      const { enabled } = await call(api, { type: "tab:self" });
      if (enabled) this.refresh();
      else this.unmount();
    },
  };
}
