import {
  type CommentCreateInput,
  type FeedbackCreateInput,
  type FeedbackQuery,
  type FeedbackStatus,
  isRecord,
  isStoreDuplicate,
  isStoreLimit,
  isStoreNotFound,
  isStorePersistence,
  StoreDuplicateError,
  StoreLimitError,
  StoreNotFoundError,
  StorePersistenceError,
} from "@siteping/core";
import type { ExtensionApi } from "./browser.js";
import type { StoredComment, StoredFeedback } from "./records.js";
import { InvalidSettingsError, type Settings } from "./settings.js";

/**
 * The messages every context sends the background, which is the only one
 * that writes storage (see `background/store.ts`). Messages are JSON: a
 * `Date` arrives as a string and an `Error` as `{}`, so records travel in
 * their stored form and errors as a {@link WireError}.
 */
export type Request =
  | { type: "feedback:create"; input: FeedbackCreateInput }
  | { type: "feedback:list"; query: FeedbackQuery }
  | { type: "feedback:find"; clientId: string }
  | { type: "feedback:owns"; id: string; projectName: string }
  | { type: "feedback:status"; id: string; status: FeedbackStatus }
  | { type: "feedback:delete"; id: string }
  | { type: "feedback:deleteAll"; projectName: string }
  | { type: "comment:add"; feedbackId: string; input: CommentCreateInput }
  | { type: "settings:set"; settings: Settings }
  | { type: "capture" }
  | { type: "tab:get"; tabId: number }
  | { type: "tab:self" }
  | { type: "tab:set"; tabId: number; enabled: boolean }
  | { type: "stats" };

export interface SiteStats {
  projectName: string;
  total: number;
  /** Feedback still to act on: `open` and `in_progress`. */
  open: number;
}

/** What each request resolves to. */
export interface Replies {
  "feedback:create": StoredFeedback;
  "feedback:list": { feedbacks: StoredFeedback[]; total: number };
  "feedback:find": StoredFeedback | null;
  "feedback:owns": boolean;
  "feedback:status": StoredFeedback;
  "feedback:delete": null;
  "feedback:deleteAll": null;
  "comment:add": StoredComment;
  "settings:set": Settings;
  capture: { dataUrl: string };
  "tab:get": { enabled: boolean };
  "tab:self": { enabled: boolean };
  "tab:set": { enabled: boolean };
  stats: SiteStats[];
}

export type RequestType = Request["type"];

/** What the background sends a content script. No reply is expected. */
export type ContentMessage = { type: "unmount" } | { type: "navigated" };

/**
 * An error in a form that survives a message. `kind` names the core store
 * error to rebuild on the caller's side, where the widget tells them apart
 * (a duplicate `clientId` is a resend, not a failure).
 */
export interface WireError {
  kind: "duplicate" | "not_found" | "limit" | "persistence" | "invalid_settings" | "other";
  message: string;
}

export type Reply<T> = { ok: true; value: T } | { ok: false; error: WireError };

export function toWireError(error: unknown): WireError {
  const message = error instanceof Error ? error.message : String(error);
  if (isStoreDuplicate(error)) return { kind: "duplicate", message };
  if (isStoreNotFound(error)) return { kind: "not_found", message };
  if (isStoreLimit(error)) return { kind: "limit", message };
  if (isStorePersistence(error)) return { kind: "persistence", message };
  if (error instanceof InvalidSettingsError) return { kind: "invalid_settings", message };
  return { kind: "other", message };
}

export function fromWireError(error: WireError): Error {
  switch (error.kind) {
    case "duplicate":
      return new StoreDuplicateError(error.message);
    case "not_found":
      return new StoreNotFoundError(error.message);
    case "limit":
      return new StoreLimitError(error.message);
    case "persistence":
      return new StorePersistenceError(error.message);
    case "invalid_settings":
      return new InvalidSettingsError(error.message);
    default:
      return new Error(error.message);
  }
}

function isReply(value: unknown): value is Reply<unknown> {
  return isRecord(value) && typeof value.ok === "boolean";
}

/**
 * Send `request` to the background and resolve with its value, or reject
 * with the error it reported. A missing or malformed reply (the background
 * was reloaded under an open page) rejects too, instead of resolving with
 * `undefined`.
 */
export async function call<T extends RequestType>(
  api: Pick<ExtensionApi, "runtime">,
  request: Extract<Request, { type: T }>,
): Promise<Replies[T]> {
  const reply = await api.runtime.sendMessage(request);
  if (!isReply(reply)) throw new Error("SitePing: the extension did not answer. Reload the page and try again.");
  if (!reply.ok) throw fromWireError(reply.error);
  return reply.value as Replies[T];
}
