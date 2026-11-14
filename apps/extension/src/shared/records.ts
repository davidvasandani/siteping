import {
  type AnnotationRecord,
  type CommentRecord,
  type FeedbackRecord,
  hasOwn,
  isRecord,
  type Serialized,
} from "@siteping/core";
import type { StorageArea } from "./browser.js";

/**
 * How feedback is laid out in `storage.local`: one key per feedback, holding
 * the record as JSON. One key each, not one array for all, so that changing a
 * status rewrites one record instead of every screenshot of the review.
 */
export const FEEDBACK_KEY_PREFIX = "fb:";

export const feedbackKey = (id: string): string => `${FEEDBACK_KEY_PREFIX}${id}`;

export const isFeedbackKey = (key: string): boolean => key.startsWith(FEEDBACK_KEY_PREFIX);

/** A record as it is stored and as it crosses a runtime message: dates as ISO strings. */
export type StoredFeedback = Serialized<FeedbackRecord>;
export type StoredComment = Serialized<CommentRecord>;

/** JSON form of a record. Explicit, because what the storage API does with a `Date` differs between browsers. */
export function serializeRecord(record: FeedbackRecord): StoredFeedback {
  return JSON.parse(JSON.stringify(record)) as StoredFeedback;
}

export function serializeComment(comment: CommentRecord): StoredComment {
  return JSON.parse(JSON.stringify(comment)) as StoredComment;
}

function toDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function reviveComment(stored: StoredComment): CommentRecord {
  return { ...stored, createdAt: toDate(stored.createdAt) ?? new Date(0) };
}

/**
 * A stored value back as a record, or `null` when it is not one. Only what
 * the rest of the code dereferences is checked (an id, the two dates, the
 * annotation list); a record that fails is skipped by the caller and left in
 * storage, never repaired or deleted, since it may be readable by a later
 * version.
 */
export function reviveRecord(value: unknown): FeedbackRecord | null {
  if (!isRecord(value) || !hasOwn(value, "id") || typeof value.id !== "string") return null;
  const stored = value as unknown as StoredFeedback;
  const createdAt = toDate(stored.createdAt);
  const updatedAt = toDate(stored.updatedAt);
  if (!createdAt || !updatedAt || !Array.isArray(stored.annotations)) return null;
  return {
    ...stored,
    createdAt,
    updatedAt,
    resolvedAt: toDate(stored.resolvedAt),
    annotations: stored.annotations.map(
      (annotation): AnnotationRecord => ({ ...annotation, createdAt: toDate(annotation.createdAt) ?? createdAt }),
    ),
    // `Serialized` leaves the optional `comments` typed as records; in storage their dates are strings too.
    comments: Array.isArray(stored.comments) ? (stored.comments as unknown as StoredComment[]).map(reviveComment) : [],
  };
}

/** Newest first, the order every list shows; the id breaks ties so the order is stable. */
function byNewest(a: FeedbackRecord, b: FeedbackRecord): number {
  return b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? -1 : 1);
}

/** Every readable feedback in the area, newest first. */
export async function readAllRecords(area: StorageArea): Promise<FeedbackRecord[]> {
  const items = await area.get(null);
  const records: FeedbackRecord[] = [];
  for (const [key, value] of Object.entries(items)) {
    if (!isFeedbackKey(key)) continue;
    const record = reviveRecord(value);
    if (record) records.push(record);
  }
  return records.sort(byNewest);
}
