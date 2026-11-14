import type { RecordingSession, RecordingState } from "../recording/model.js";
import { RECORDING_LIMIT_MS } from "../recording/model.js";
import type { ExtensionApi } from "../shared/browser.js";
import type { ExtensionStore } from "./store.js";
import type { TabController } from "./tabs.js";

type Api = Pick<ExtensionApi, "runtime" | "tabs" | "storage" | "offscreen" | "tabCapture">;

export interface RecordingCoordinator {
  start(tabId: number, feedbackId: string): Promise<RecordingState>;
  stop(reason?: "manual" | "limit"): Promise<RecordingState>;
  state(): Promise<RecordingState>;
  delete(feedbackId: string): Promise<void>;
  deleteProject(projectName: string): Promise<void>;
  finished(state: RecordingState): Promise<void>;
}

export function createRecordingCoordinator(api: Api, store: ExtensionStore, tabs: TabController): RecordingCoordinator {
  const url = api.runtime.getURL("offscreen.html");
  let activeTabId: number | undefined;
  const supported = Boolean(api.offscreen && api.tabCapture && api.runtime.getContexts);

  const changed = (): Promise<void> => api.storage.local.set({ "recording-revision": new Date().toISOString() });

  async function ensureOffscreen(): Promise<void> {
    if ((await api.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] })).length > 0)
      return;
    await api.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA", "BLOBS"],
      justification: "Record the current tab and store the reviewer’s local SitePing video.",
    });
  }

  async function send<T>(message: unknown): Promise<T> {
    await ensureOffscreen();
    const reply = (await api.runtime.sendMessage(message)) as { ok?: boolean; value?: T; error?: string };
    if (!reply?.ok) throw new Error(reply?.error ?? "The SitePing recorder did not answer.");
    return reply.value as T;
  }

  async function show(state: RecordingState): Promise<void> {
    if (state.phase === "idle") return;
    await api.tabs.sendMessage(state.session.tabId, { type: "recording:show", state }).catch(() => {});
  }

  return {
    async start(tabId, feedbackId) {
      if (!supported) throw new Error("Screen recording is unavailable in this browser.");
      if (!(await tabs.isEnabled(tabId))) throw new Error("Switch SitePing on for this page before recording.");
      const tab = await api.tabs.get(tabId);
      if (!tab.active || !tab.url?.startsWith("http"))
        throw new Error("Recording can only start in the web page in front.");
      const feedback = (await store.all()).find((record) => record.id === feedbackId);
      if (!feedback) throw new Error("Choose feedback that still exists before recording.");
      if (new URL(tab.url).origin !== feedback.projectName) throw new Error("That feedback belongs to another site.");
      const current = await this.state();
      if (current.phase !== "idle") throw new Error("Another SitePing recording is already running.");
      const session: RecordingSession = {
        feedbackId,
        projectName: feedback.projectName,
        pageUrl: tab.url,
        tabId,
        startedAt: new Date().toISOString(),
        limitMs: RECORDING_LIMIT_MS,
      };
      await ensureOffscreen();
      const streamId = await api.tabCapture.getMediaStreamId({ targetTabId: tabId });
      const state = await send<RecordingState>({
        target: "offscreen",
        type: "recording:offscreen-start",
        streamId,
        session,
      });
      activeTabId = tabId;
      await show(state);
      return state;
    },
    async stop(reason = "manual") {
      if (!supported) return { phase: "idle" };
      return send<RecordingState>({ target: "offscreen", type: "recording:offscreen-stop", reason });
    },
    async state() {
      if (!supported) return { phase: "idle" };
      const contexts = await api.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
      if (contexts.length === 0) return { phase: "idle" };
      return send<RecordingState>({ target: "offscreen", type: "recording:offscreen-state" });
    },
    async delete(feedbackId) {
      if (!supported) return;
      await send<null>({ target: "offscreen", type: "recording:offscreen-delete", feedbackId });
      await changed();
    },
    async deleteProject(projectName) {
      if (!supported) return;
      await send<null>({ target: "offscreen", type: "recording:offscreen-delete-project", projectName });
      await changed();
    },
    async finished(finalState) {
      const result = finalState.phase === "idle" ? finalState.lastResult : undefined;
      const tabId = result?.tabId ?? activeTabId;
      if (tabId !== undefined)
        await api.tabs.sendMessage(tabId, { type: "recording:hide", message: result?.message }).catch(() => {});
      activeTabId = undefined;
      await changed().catch(() => {});
    },
  };
}
