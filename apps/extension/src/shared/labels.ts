import type { FeedbackStatus, FeedbackType } from "@siteping/core";

/**
 * Names and colours for feedback types and statuses, shared by the review
 * page and both exports so a "Bug" looks the same in all three. Colours are
 * the widget's light theme (`packages/widget/src/styles/theme.ts`).
 */

export const ACCENT = "#0066ff";

export const TYPE_LABEL: Record<FeedbackType, string> = {
  question: "Question",
  change: "Change",
  bug: "Bug",
  other: "Other",
};

export const TYPE_COLOR: Record<FeedbackType, string> = {
  question: "#2563eb",
  change: "#b45309",
  bug: "#d01f1f",
  other: "#5b6778",
};

export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  wont_fix: "Won't fix",
};

export const STATUS_COLOR: Record<FeedbackStatus, string> = {
  open: "#0066ff",
  in_progress: "#7c3aed",
  resolved: "#15803d",
  wont_fix: "#5b6778",
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** `14 Nov 2026`: unambiguous for readers on either side of the Atlantic. */
export function formatDate(date: Date): string {
  return DATE_FORMAT.format(date);
}
