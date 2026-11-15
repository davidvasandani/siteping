import {
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
  type FeedbackRecord,
  type FeedbackStatus,
  type FeedbackType,
  isSafeImageUrl,
  type ScreenshotRegion,
} from "@siteping/core";
import { describeEnvironment, type EnvironmentMetadata } from "./environment.js";
import { pageUrl, siteLabel } from "./scope.js";

/** One feedback as an export shows it. Both exports are built from this, neither reads storage. */
export interface ReportItem {
  /** Position in the export, from 1: the number a reader quotes back. */
  number: number;
  id: string;
  type: FeedbackType;
  status: FeedbackStatus;
  message: string;
  /** Absolute address of the page, or `null` when the record holds none that is safe to link. */
  pageUrl: string | null;
  /** The page as text: its path, with the host in front when the export mixes sites. */
  pageLabel: string;
  author: string;
  createdAt: Date;
  environment: EnvironmentMetadata;
  comments: { author: string; body: string; createdAt: Date }[];
  screenshot: { dataUrl: string; region: ScreenshotRegion | null } | null;
  recording?: { durationMs: number; posterDataUrl: string | null };
}

export interface Report {
  /** What the export is about: a site's host, or `All sites`. */
  title: string;
  /** Number of sites the items come from. */
  siteCount: number;
  generatedAt: Date;
  items: ReportItem[];
}

export interface ReportCounts {
  status: Record<FeedbackStatus, number>;
  type: Record<FeedbackType, number>;
}

/** Build the export model from records, in the order given. */
export function toReport(
  records: readonly FeedbackRecord[],
  generatedAt: Date,
  recordingInfo: ReadonlyMap<string, { durationMs: number; posterDataUrl: string | null }> = new Map(),
): Report {
  const sites = new Set(records.map((record) => record.projectName));
  const mixed = sites.size > 1;
  const [onlySite] = sites;
  return {
    title: mixed || onlySite === undefined ? "All sites" : siteLabel(onlySite),
    siteCount: sites.size,
    generatedAt,
    items: records.map((record, index) => {
      const recording = recordingInfo.get(record.id);
      return {
        number: index + 1,
        id: record.id,
        type: record.type,
        status: record.status,
        message: record.message,
        pageUrl: pageUrl(record),
        pageLabel: mixed ? `${siteLabel(record.projectName)}${record.url}` : record.url,
        author: record.authorName,
        createdAt: record.createdAt,
        environment: describeEnvironment(record.userAgent, record.viewport),
        comments: (record.comments ?? []).map((comment) => ({
          author: comment.authorName,
          body: comment.body,
          createdAt: comment.createdAt,
        })),
        // Only an inline image: the extension stores nothing else, and an
        // export must not fetch whatever address a record happens to carry.
        screenshot:
          record.screenshotUrl?.startsWith("data:") && isSafeImageUrl(record.screenshotUrl)
            ? { dataUrl: record.screenshotUrl, region: record.screenshotRegion }
            : null,
        ...(recording ? { recording } : {}),
      };
    }),
  };
}

export function countItems(items: readonly Pick<ReportItem, "status" | "type">[]): ReportCounts {
  const status = Object.fromEntries(FEEDBACK_STATUSES.map((key) => [key, 0])) as Record<FeedbackStatus, number>;
  const type = Object.fromEntries(FEEDBACK_TYPES.map((key) => [key, 0])) as Record<FeedbackType, number>;
  for (const item of items) {
    status[item.status] += 1;
    type[item.type] += 1;
  }
  return { status, type };
}

/** `1 item`, `3 items`. */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
