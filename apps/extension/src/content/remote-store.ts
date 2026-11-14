import type {
  CommentCreateInput,
  CommentRecord,
  FeedbackCreateInput,
  FeedbackPage,
  FeedbackQuery,
  FeedbackRecord,
  FeedbackUpdateInput,
  SitepingStore,
} from "@siteping/core";
import type { ContentApi } from "../shared/browser.js";
import { call } from "../shared/messages.js";
import { reviveComment, reviveRecord, type StoredFeedback } from "../shared/records.js";

function revived(stored: StoredFeedback): FeedbackRecord {
  const record = reviveRecord(stored);
  if (!record) throw new Error("SitePing: the extension returned a feedback that cannot be read.");
  return record;
}

/**
 * The store the widget talks to inside a page: every call is a message to
 * the background, which holds the real one (`background/store.ts`). It
 * rebuilds what a message flattens: dates, and the store errors the widget
 * tells apart.
 */
export function createRemoteStore(api: Pick<ContentApi, "runtime">): SitepingStore {
  return {
    async createFeedback(input: FeedbackCreateInput): Promise<FeedbackRecord> {
      return revived(await call(api, { type: "feedback:create", input }));
    },

    async getFeedbacks(query: FeedbackQuery): Promise<FeedbackPage> {
      const { feedbacks, total } = await call(api, { type: "feedback:list", query });
      return { feedbacks: feedbacks.map(revived), total };
    },

    async findByClientId(clientId: string): Promise<FeedbackRecord | null> {
      const stored = await call(api, { type: "feedback:find", clientId });
      return stored ? revived(stored) : null;
    },

    verifyProjectOwnership(id: string, projectName: string): Promise<boolean> {
      return call(api, { type: "feedback:owns", id, projectName });
    },

    // Only the status crosses: the background derives the closure timestamp
    // from it, as the HTTP handler does.
    async updateFeedback(id: string, data: FeedbackUpdateInput): Promise<FeedbackRecord> {
      return revived(await call(api, { type: "feedback:status", id, status: data.status }));
    },

    async deleteFeedback(id: string): Promise<void> {
      await call(api, { type: "feedback:delete", id });
    },

    async deleteAllFeedbacks(projectName: string): Promise<void> {
      await call(api, { type: "feedback:deleteAll", projectName });
    },

    async addComment(feedbackId: string, input: CommentCreateInput): Promise<CommentRecord> {
      return reviveComment(await call(api, { type: "comment:add", feedbackId, input }));
    },
  };
}
