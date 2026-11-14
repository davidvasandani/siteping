import { extensionApi, type TabInfo } from "../shared/browser.js";
import { call } from "../shared/messages.js";
import { plural } from "../shared/report.js";
import { isAnnotatable, siteLabel } from "../shared/scope.js";
import { byId } from "./dom.js";

/**
 * The toolbar popup: switch SitePing on or off for the tab in front, and a
 * way into the review page. Opening it is what grants the extension access
 * to that tab; nothing here asks for more.
 */

const api = extensionApi();
const site = byId<HTMLParagraphElement>("site");
const enabled = byId<HTMLInputElement>("enabled");
const hint = byId<HTMLElement>("hint");
const error = byId<HTMLParagraphElement>("error");
const counts = byId<HTMLParagraphElement>("counts");
const review = byId<HTMLButtonElement>("review");

function showError(message: string): void {
  error.textContent = message;
  error.hidden = false;
}

/** The tab the popup is about: the one in front, or the one named in the address (how the tests open it). */
async function currentTab(): Promise<TabInfo | undefined> {
  const named = Number(new URLSearchParams(window.location.search).get("tabId"));
  if (Number.isInteger(named) && named > 0) return api.tabs.get(named);
  return (await api.tabs.query({ active: true, currentWindow: true }))[0];
}

async function showCounts(projectName: string | null): Promise<void> {
  const stats = await call(api, { type: "stats" });
  const total = stats.reduce((sum, entry) => sum + entry.total, 0);
  const here = stats.find((entry) => entry.projectName === projectName);
  counts.textContent = here
    ? `${plural(here.total, "feedback item")} on this site, ${here.open} open.`
    : total > 0
      ? `Nothing on this site yet. ${plural(total, "feedback item")} elsewhere.`
      : "No feedback yet.";
}

async function start(): Promise<void> {
  const tab = await currentTab();
  const tabId = tab?.id;
  const annotatable = isAnnotatable(tab?.url);
  const projectName = annotatable && tab?.url ? new URL(tab.url).origin : null;
  site.textContent = projectName ? siteLabel(projectName) : "This page";

  review.addEventListener("click", () => {
    const target = api.runtime.getURL(`review.html${projectName ? `?site=${encodeURIComponent(projectName)}` : ""}`);
    void api.tabs.create({ url: target }).then(() => window.close());
  });
  void showCounts(projectName).catch(() => {
    counts.textContent = "";
  });

  if (tabId === undefined || !annotatable) {
    hint.textContent = "SitePing works on web pages (http and https).";
    showError("SitePing can't run on this page.");
    return;
  }

  enabled.checked = (await call(api, { type: "tab:get", tabId })).enabled;
  enabled.disabled = false;
  enabled.addEventListener("change", () => {
    const wanted = enabled.checked;
    error.hidden = true;
    enabled.disabled = true;
    call(api, { type: "tab:set", tabId, enabled: wanted })
      .catch((cause: unknown) => {
        enabled.checked = !wanted;
        showError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        enabled.disabled = false;
      });
  });
}

start().catch((cause: unknown) => showError(cause instanceof Error ? cause.message : String(cause)));
