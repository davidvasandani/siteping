import { isClosedStatus, isRecord, toFeedbackUpdate } from "@siteping/core";
import type { ExtensionApi, MessageSender } from "../shared/browser.js";
import { type Replies, type Reply, type Request, type SiteStats, toWireError } from "../shared/messages.js";
import { serializeComment, serializeRecord } from "../shared/records.js";
import { normalizeSettings, SETTINGS_KEY } from "../shared/settings.js";
import type { RecordingCoordinator } from "./recording.js";
import type { ExtensionStore } from "./store.js";
import type { TabController } from "./tabs.js";

export interface HandlerDeps {
  api: Pick<ExtensionApi, "storage" | "tabs">;
  store: ExtensionStore;
  tabs: TabController;
  recording?: RecordingCoordinator;
}

export type Handler = (message: unknown, sender: MessageSender) => Promise<Reply<unknown>>;

/**
 * Answer the requests of `shared/messages.ts`. This is the extension's
 * equivalent of the HTTP handler: the edge where a status becomes a
 * `FeedbackUpdateInput` (`toFeedbackUpdate`) and records are serialised.
 * Every failure, an unknown request included, comes back as a reply rather
 * than an exception, so a caller never waits on a message nobody answers.
 */
export function createHandler({ api, store, tabs, recording: suppliedRecording }: HandlerDeps): Handler {
  const recording: RecordingCoordinator = suppliedRecording ?? {
    start: async () => {
      throw new Error("Screen recording is unavailable in this browser.");
    },
    stop: async () => ({ phase: "idle" }),
    state: async () => ({ phase: "idle" }),
    delete: async () => {},
    deleteProject: async () => {},
    finished: async () => {},
  };
  const answer: {
    [T in Request["type"]]: (request: Extract<Request, { type: T }>, sender: MessageSender) => Promise<Replies[T]>;
  } = {
    "feedback:create": async ({ input }) => serializeRecord(await store.createFeedback(input)),

    "feedback:list": async ({ query }) => {
      const { feedbacks, total } = await store.getFeedbacks(query);
      return { feedbacks: feedbacks.map(serializeRecord), total };
    },

    "feedback:find": async ({ clientId }) => {
      const record = await store.findByClientId(clientId);
      return record ? serializeRecord(record) : null;
    },

    "feedback:owns": ({ id, projectName }) => store.verifyProjectOwnership(id, projectName),

    "feedback:status": async ({ id, status }) =>
      serializeRecord(await store.updateFeedback(id, toFeedbackUpdate(status))),

    "feedback:delete": async ({ id }) => {
      await store.deleteFeedback(id);
      await recording.delete(id);
      return null;
    },

    "feedback:deleteAll": async ({ projectName }) => {
      await store.deleteAllFeedbacks(projectName);
      await recording.deleteProject(projectName);
      return null;
    },

    "comment:add": async ({ feedbackId, input }) => serializeComment(await store.addComment(feedbackId, input)),

    "settings:set": async ({ settings }) => {
      const normalized = normalizeSettings(settings);
      await api.storage.local.set({ [SETTINGS_KEY]: normalized });
      return normalized;
    },

    // The capture is of whatever the window shows. A content script in a tab
    // that is not in front must not receive another tab's pixels.
    capture: async (_request, sender) => {
      const tab = sender.tab;
      if (!tab?.active || tab.windowId === undefined) {
        throw new Error("A screenshot can only be taken of the tab in front.");
      }
      return { dataUrl: await api.tabs.captureVisibleTab(tab.windowId, { format: "png" }) };
    },

    "tab:get": async ({ tabId }) => ({ enabled: await tabs.isEnabled(tabId) }),

    // A content script asking about its own tab, whose id it cannot know.
    "tab:self": async (_request, sender) => ({
      enabled: sender.tab?.id !== undefined && (await tabs.isEnabled(sender.tab.id)),
    }),

    "tab:set": async ({ tabId, enabled }) => {
      await (enabled ? tabs.enable(tabId) : tabs.disable(tabId));
      return { enabled };
    },

    stats: async () => {
      const sites = new Map<string, SiteStats>();
      for (const record of await store.all()) {
        const site = sites.get(record.projectName) ?? { projectName: record.projectName, total: 0, open: 0 };
        site.total += 1;
        if (!isClosedStatus(record.status)) site.open += 1;
        sites.set(record.projectName, site);
      }
      return [...sites.values()];
    },

    "recording:start": ({ tabId, feedbackId }) => recording.start(tabId, feedbackId),
    "recording:stop": ({ reason }) => recording.stop(reason),
    "recording:state": async (_request, sender) => {
      const state = await recording.state();
      return state.phase !== "idle" && sender.tab?.id !== undefined && state.session.tabId !== sender.tab.id
        ? { phase: "idle" }
        : state;
    },
    "recording:delete": async ({ feedbackId }) => {
      await recording.delete(feedbackId);
      return null;
    },
  };

  return async (message, sender) => {
    try {
      if (!isRecord(message) || typeof message.type !== "string" || !Object.hasOwn(answer, message.type)) {
        throw new Error("SitePing: unknown request.");
      }
      const request = message as unknown as Request;
      const respond = answer[request.type] as (request: Request, sender: MessageSender) => Promise<unknown>;
      return { ok: true, value: await respond(request, sender) };
    } catch (error) {
      return { ok: false, error: toWireError(error) };
    }
  };
}
