import {
  type CollectionStore,
  createCollectionStore,
  type FeedbackRecord,
  type SitepingStore,
  StorePersistenceError,
} from "@siteping/core";
import type { StorageArea } from "../shared/browser.js";
import { feedbackKey, readAllRecords, serializeRecord } from "../shared/records.js";

/** The store the background serves: core's contract with threads, plus the whole snapshot for the popup's counts. */
export type ExtensionStore = CollectionStore &
  Required<Pick<SitepingStore, "createFeedbackIfAbsent" | "addComment" | "addCommentIfAbsent" | "deleteComment">> & {
    /** Every stored feedback, newest first. */
    all(): Promise<FeedbackRecord[]>;
  };

/**
 * The extension's one store, over `storage.local`.
 *
 * It lives in the background and nowhere else. Core's collection engine
 * queues mutations per instance, in one JS realm; an instance in each tab
 * would let two tabs start from the same snapshot and the later write erase
 * the earlier. Tabs and extension pages therefore send their writes here
 * (`shared/messages.ts`), and this instance's queue orders them all.
 *
 * The snapshot is read once per background lifetime and kept: nothing else
 * writes these keys, so it cannot go stale. `persist` compares the new
 * snapshot with it record by record. The engine never edits a loaded record,
 * it replaces it, so an identical object is an unchanged record and only the
 * others are written.
 */
export function createExtensionStore(area: StorageArea): ExtensionStore {
  let snapshot: Promise<FeedbackRecord[]> | null = null;

  // One promise for concurrent callers: two reads would return two arrays of
  // different objects, and `persist` would then see every record as changed.
  const load = (): Promise<FeedbackRecord[]> => {
    snapshot ??= readAllRecords(area).catch((error: unknown) => {
      snapshot = null;
      throw error;
    });
    return snapshot;
  };

  const persist = async (next: FeedbackRecord[]): Promise<void> => {
    const previous = new Map((await load()).map((record) => [record.id, record]));
    const changed: Record<string, unknown> = {};
    for (const record of next) {
      if (previous.get(record.id) !== record) changed[feedbackKey(record.id)] = serializeRecord(record);
      previous.delete(record.id);
    }
    const removed = [...previous.keys()].map(feedbackKey);
    try {
      if (Object.keys(changed).length > 0) await area.set(changed);
      if (removed.length > 0) await area.remove(removed);
    } catch (cause) {
      // The write may have landed in part. Forget the snapshot so the next
      // read is what storage really holds.
      snapshot = null;
      throw new StorePersistenceError(undefined, { cause });
    }
    snapshot = Promise.resolve(next);
  };

  const engine = createCollectionStore({
    load,
    persist,
    generateId: () => crypto.randomUUID(),
    comments: true,
  });

  return { ...engine, all: load };
}
