import { deleteProjectRecordings, deleteRecording, putRecording, setActiveSession } from "../recording/database.js";
import {
  preferredMimeType,
  type RecordingResult,
  type RecordingSession,
  type RecordingState,
} from "../recording/model.js";

type OffscreenMessage =
  | { target: "offscreen"; type: "recording:offscreen-start"; streamId: string; session: RecordingSession }
  | { target: "offscreen"; type: "recording:offscreen-stop"; reason: "manual" | "limit" | "track-ended" }
  | { target: "offscreen"; type: "recording:offscreen-state" }
  | { target: "offscreen"; type: "recording:offscreen-delete"; feedbackId: string }
  | { target: "offscreen"; type: "recording:offscreen-delete-project"; projectName: string };

let state: RecordingState = { phase: "idle" };
let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: Blob[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let stopReason: RecordingResult["reason"] = "manual";
let mutationQueue: Promise<unknown> = Promise.resolve();

function mutate<T>(task: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(task, task);
  mutationQueue = result.catch(() => {});
  return result;
}

async function posterOf(blob: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  try {
    video.muted = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("The recording poster could not be read."));
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, video.videoWidth);
    canvas.height = Math.max(1, video.videoHeight);
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    URL.revokeObjectURL(url);
  }
}

async function finish(): Promise<void> {
  clearTimeout(timer);
  const active = state.phase === "idle" ? null : state.session;
  const blob = new Blob(chunks, { type: recorder?.mimeType || "video/webm" });
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
  recorder = null;
  stream = null;
  chunks = [];
  if (!active || blob.size === 0) {
    await setActiveSession(null);
    state = {
      phase: "idle",
      lastResult: {
        kind: "failed",
        ...(active ? { feedbackId: active.feedbackId, tabId: active.tabId } : {}),
        message: "Recording ended before video could be saved.",
      },
    };
  } else {
    try {
      const durationMs = Math.min(active.limitMs, Math.max(1, Date.now() - Date.parse(active.startedAt)));
      await mutate(async () => {
        const ownership = (await chrome.runtime.sendMessage({
          type: "feedback:owns",
          id: active.feedbackId,
          projectName: active.projectName,
        })) as { ok?: boolean; value?: boolean };
        if (!ownership.ok || !ownership.value) throw new Error("Its feedback was deleted before the video finished.");
        await putRecording({
          feedbackId: active.feedbackId,
          projectName: active.projectName,
          pageUrl: active.pageUrl,
          mimeType: blob.type,
          byteLength: blob.size,
          durationMs,
          createdAt: new Date().toISOString(),
          poster: await posterOf(blob),
          video: blob,
        });
      });
      await setActiveSession(null);
      state = {
        phase: "idle",
        lastResult: {
          kind: "saved",
          feedbackId: active.feedbackId,
          tabId: active.tabId,
          ...(stopReason ? { reason: stopReason } : {}),
          message: stopReason === "limit" ? "Recording saved after the two-minute limit." : "Recording saved.",
        },
      };
    } catch (cause) {
      await setActiveSession(null).catch(() => {});
      state = {
        phase: "idle",
        lastResult: {
          kind: "failed",
          feedbackId: active.feedbackId,
          tabId: active.tabId,
          message: `Recording was not saved: ${cause instanceof Error ? cause.message : String(cause)}`,
        },
      };
    }
  }
  await chrome.runtime.sendMessage({ target: "background", type: "recording:offscreen-finished", state });
}

async function start(streamId: string, session: RecordingSession): Promise<RecordingState> {
  if (state.phase !== "idle") throw new Error("Another SitePing recording is already running.");
  state = { phase: "starting", session };
  try {
    await setActiveSession(session);
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } } as MediaTrackConstraints,
    });
    const mimeType = preferredMimeType();
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => void finish();
    stream.getVideoTracks()[0]?.addEventListener("ended", () => void stop("track-ended"), { once: true });
    recorder.start(1000);
    state = { phase: "recording", session };
    timer = setTimeout(() => void stop("limit"), session.limitMs);
    return state;
  } catch (cause) {
    stream?.getTracks().forEach((track) => {
      track.stop();
    });
    stream = null;
    recorder = null;
    await setActiveSession(null).catch(() => {});
    state = { phase: "idle", lastResult: { kind: "failed", message: String(cause) } };
    throw cause;
  }
}

async function stop(reason: "manual" | "limit" | "track-ended"): Promise<RecordingState> {
  if (!recorder || state.phase === "idle") return state;
  stopReason = reason;
  state = { phase: "stopping", session: state.session };
  if (recorder.state !== "inactive") recorder.stop();
  return state;
}

chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
  const message = raw as OffscreenMessage;
  if (message?.target !== "offscreen") return undefined;
  const task = (() => {
    switch (message.type) {
      case "recording:offscreen-start":
        return start(message.streamId, message.session);
      case "recording:offscreen-stop":
        return stop(message.reason);
      case "recording:offscreen-state":
        return Promise.resolve(state);
      case "recording:offscreen-delete":
        return mutate(() => deleteRecording(message.feedbackId)).then(() => null);
      case "recording:offscreen-delete-project":
        return mutate(() => deleteProjectRecordings(message.projectName)).then(() => null);
    }
  })();
  void task.then(
    (value) => sendResponse({ ok: true, value }),
    (cause) => sendResponse({ ok: false, error: String(cause) }),
  );
  return true;
});
