import { type FeedbackRecord, type FeedbackStatus, type FeedbackType, isClosedStatus } from "@siteping/core";
import type { Report } from "../shared/report.js";
import { siteLabel } from "../shared/scope.js";

/** What the review page shows and exports, as plain functions of the stored records. */

export const ALL = "all";

export interface Filters {
  /** A project (origin), or `all`. */
  site: string;
  status: FeedbackStatus | typeof ALL;
  type: FeedbackType | typeof ALL;
}

export const NO_FILTERS: Filters = { site: ALL, status: ALL, type: ALL };

export interface SiteOption {
  projectName: string;
  label: string;
  count: number;
}

/** The sites that have feedback, by name, for the site filter. */
export function sitesOf(records: readonly FeedbackRecord[]): SiteOption[] {
  const sites = new Map<string, SiteOption>();
  for (const { projectName } of records) {
    const site = sites.get(projectName) ?? { projectName, label: siteLabel(projectName), count: 0 };
    site.count += 1;
    sites.set(projectName, site);
  }
  return [...sites.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function applyFilters(records: readonly FeedbackRecord[], filters: Filters): FeedbackRecord[] {
  return records.filter(
    (record) =>
      (filters.site === ALL || record.projectName === filters.site) &&
      (filters.status === ALL || record.status === filters.status) &&
      (filters.type === ALL || record.type === filters.type),
  );
}

/**
 * A site filter that no longer matches anything (its last feedback was
 * deleted, perhaps in another tab) falls back to every site, so the page
 * never shows an empty list while feedback exists elsewhere.
 */
export function reconcileFilters(filters: Filters, records: readonly FeedbackRecord[]): Filters {
  if (filters.site === ALL || records.some((record) => record.projectName === filters.site)) return filters;
  return { ...filters, site: ALL };
}

/** The feedback an export takes: what is shown, minus what the reviewer unticked. */
export function chosen(shown: readonly FeedbackRecord[], excluded: ReadonlySet<string>): FeedbackRecord[] {
  return shown.filter((record) => !excluded.has(record.id));
}

/** `12 shown · 10 selected · 7 open`. */
export function summarize(shown: readonly FeedbackRecord[], selected: readonly FeedbackRecord[]): string {
  if (shown.length === 0) return "Nothing to show";
  const open = shown.filter((record) => !isClosedStatus(record.status)).length;
  return [
    `${shown.length} shown`,
    ...(selected.length === shown.length ? [] : [`${selected.length} selected`]),
    `${open} open`,
  ].join(" · ");
}

/** `siteping-example.com-2026-11-14.pdf`: safe on every file system, sortable by date. */
export function exportFileName(report: Pick<Report, "title" | "generatedAt">): string {
  const site =
    report.title
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "") || "feedback";
  const date = report.generatedAt;
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `siteping-${site}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.pdf`;
}
