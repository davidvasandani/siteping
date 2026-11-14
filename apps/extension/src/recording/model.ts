export const RECORDING_LIMIT_MS = 120_000;

export interface RecordingMetadata {
  feedbackId: string;
  projectName: string;
  pageUrl: string;
  mimeType: string;
  byteLength: number;
  durationMs: number;
  createdAt: string;
  poster: Blob | null;
  video: Blob;
}

export interface RecordingSession {
  feedbackId: string;
  projectName: string;
  pageUrl: string;
  tabId: number;
  startedAt: string;
  limitMs: number;
}

export type RecordingResult = {
  kind: "saved" | "failed";
  message: string;
  feedbackId?: string;
  tabId?: number;
  reason?: "manual" | "limit" | "track-ended" | "interrupted";
};

export type RecordingState =
  | { phase: "idle"; lastResult?: RecordingResult }
  | { phase: "starting" | "recording" | "stopping"; session: RecordingSession };

export function formatRecordingTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function recordingFileName(feedbackId: string, createdAt: string): string {
  const stamp = createdAt.replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
  const safeId = feedbackId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
  return `siteping-${safeId}-${stamp}.webm`;
}

export function preferredMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}
