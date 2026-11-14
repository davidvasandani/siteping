import { type FeedbackRecord, parseHttpUrl } from "@siteping/core";

/**
 * Query parameter that opens a page focused on one feedback: the widget's
 * `deepLink` default, which the review page's "Open page" links carry.
 */
export const DEEP_LINK_PARAM = "siteping";

/**
 * Parameters that say how a visitor arrived, not which page they are on. The
 * same page reached from a newsletter and from a search must show the same
 * markers.
 */
const TRACKING_PARAM = /^(utm_\w+|gclid|fbclid|msclkid)$/i;

/** Whether the extension can run on a page: only `http(s)` documents accept injected scripts. */
export function isAnnotatable(url: string | undefined): boolean {
  return url !== undefined && parseHttpUrl(url) !== null;
}

/**
 * The project a page belongs to: its origin. One site is one project, so a
 * review, an export and the widget's "Delete all" each cover exactly one site.
 */
export function projectOf(location: Pick<Location, "origin">): string {
  return location.origin;
}

/**
 * The identity of a page within its site: path and query, without the
 * deep-link and tracking parameters. It is both what a feedback records as
 * its `url` and what the widget compares it against, so the two cannot
 * disagree. The query is kept because on many sites it selects the page
 * (`?p=12`, `?id=5`). Relative on purpose: `new URL(url, projectName)` is the
 * page.
 */
export function pageScopeUrl(location: Pick<Location, "pathname" | "search">): string {
  const params = new URLSearchParams(location.search);
  for (const name of [...params.keys()]) {
    if (name === DEEP_LINK_PARAM || TRACKING_PARAM.test(name)) params.delete(name);
  }
  const query = params.toString();
  return query ? `${location.pathname}?${query}` : location.pathname;
}

/**
 * The page a feedback was recorded on, as a URL of its own site, or `null`.
 *
 * The stored `url` is a path, and it is joined to the site's origin as text
 * rather than resolved against it: resolution would read a path that starts
 * with two slashes (`//other.example/page` is a valid path) as another host,
 * and a link in the review page or an export would then lead off the site
 * the feedback is about. Anything that is not a path, or that still lands
 * elsewhere, is refused.
 */
function resolvePage(record: Pick<FeedbackRecord, "projectName" | "url">): URL | null {
  const site = parseHttpUrl(record.projectName);
  if (!site || !record.url.startsWith("/")) return null;
  const page = parseHttpUrl(`${site.origin}${record.url}`);
  return page && page.origin === site.origin ? page : null;
}

/** Absolute URL of the page a feedback was recorded on, or `null` when the record holds no page of its site. */
export function pageUrl(record: Pick<FeedbackRecord, "projectName" | "url">): string | null {
  return resolvePage(record)?.href ?? null;
}

/** {@link pageUrl} with the parameter that makes the widget focus the feedback once it is switched on there. */
export function deepLinkUrl(record: Pick<FeedbackRecord, "id" | "projectName" | "url">): string | null {
  const url = resolvePage(record);
  if (!url) return null;
  url.searchParams.set(DEEP_LINK_PARAM, record.id);
  return url.href;
}

/** A site as a reader names it: `example.com`, not `https://example.com`. */
export function siteLabel(projectName: string): string {
  return parseHttpUrl(projectName)?.host ?? projectName;
}
