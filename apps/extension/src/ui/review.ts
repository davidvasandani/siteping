import {
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
  type FeedbackRecord,
  type FeedbackStatus,
  type FeedbackType,
  isSafeImageUrl,
} from "@siteping/core";
import { rasterizeText, toJpeg } from "../pdf/raster.js";
import { buildReportPdf } from "../pdf/report.js";
import { extensionApi } from "../shared/browser.js";
import { formatDate, STATUS_COLOR, STATUS_LABEL, TYPE_COLOR, TYPE_LABEL } from "../shared/labels.js";
import { call } from "../shared/messages.js";
import { isFeedbackKey, readAllRecords } from "../shared/records.js";
import { plural, toReport } from "../shared/report.js";
import { deepLinkUrl, siteLabel } from "../shared/scope.js";
import { DEFAULT_SETTINGS, readSettings, SETTINGS_KEY, type Settings } from "../shared/settings.js";
import { buildClipboard, buildSlackMessages, type SlackPayload } from "../slack/message.js";
import { SLACK_ORIGIN, sendToSlack } from "../slack/send.js";
import { byId, h } from "./dom.js";
import {
  ALL,
  applyFilters,
  chosen,
  exportFileName,
  type Filters,
  NO_FILTERS,
  reconcileFilters,
  sitesOf,
  summarize,
} from "./review-model.js";

/**
 * The review page: everything stored, by site, with the two exports.
 *
 * It reads storage directly (a read cannot conflict with anything, and a
 * whole review with its screenshots is too much for one message) and sends
 * every change to the background, the only writer. It redraws whenever
 * storage changes, so feedback left in another tab appears by itself.
 */

const api = extensionApi();

const list = byId<HTMLElement>("list");
const summary = byId<HTMLParagraphElement>("summary");
const notice = byId<HTMLParagraphElement>("notice");
const filterSite = byId<HTMLSelectElement>("filter-site");
const filterStatus = byId<HTMLSelectElement>("filter-status");
const filterType = byId<HTMLSelectElement>("filter-type");
const exportPdf = byId<HTMLButtonElement>("export-pdf");
const sendSlack = byId<HTMLButtonElement>("send-slack");
const copySlack = byId<HTMLButtonElement>("copy-slack");
const settingsDialog = byId<HTMLDialogElement>("settings");
const settingsError = byId<HTMLParagraphElement>("settings-error");
const settingsName = byId<HTMLInputElement>("settings-name");
const settingsEmail = byId<HTMLInputElement>("settings-email");
const settingsSlack = byId<HTMLInputElement>("settings-slack");
const slackDialog = byId<HTMLDialogElement>("slack");
const slackWhat = byId<HTMLParagraphElement>("slack-what");

let records: FeedbackRecord[] = [];
let settings: Settings = { ...DEFAULT_SETTINGS };
let filters: Filters = { ...NO_FILTERS, site: new URLSearchParams(window.location.search).get("site") ?? ALL };
/** Ids the reviewer unticked: left out of exports until ticked again. */
const excluded = new Set<string>();
/** Export buttons whose export is running: they stay disabled through any redraw. */
const running = new Set<HTMLButtonElement>();
/** The Slack send the open confirmation describes, taken when it opened. */
let confirmedSlack: { webhookUrl: string; payloads: SlackPayload[] } | null = null;

const shown = (): FeedbackRecord[] => applyFilters(records, filters);
const selection = (): FeedbackRecord[] => chosen(shown(), excluded);
const message = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

function say(text: string, kind: "ok" | "error" = "ok"): void {
  notice.textContent = text;
  notice.classList.toggle("notice-error", kind === "error");
  notice.hidden = false;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function option(value: string, label: string, selected: boolean): HTMLOptionElement {
  return h("option", { value, selected }, label);
}

function renderFilters(): void {
  filterSite.replaceChildren(
    option(ALL, "All sites", filters.site === ALL),
    ...sitesOf(records).map((site) =>
      option(site.projectName, `${site.label} (${site.count})`, filters.site === site.projectName),
    ),
  );
  filterStatus.replaceChildren(
    option(ALL, "Any status", filters.status === ALL),
    ...FEEDBACK_STATUSES.map((status) => option(status, STATUS_LABEL[status], filters.status === status)),
  );
  filterType.replaceChildren(
    option(ALL, "Any type", filters.type === ALL),
    ...FEEDBACK_TYPES.map((type) => option(type, TYPE_LABEL[type], filters.type === type)),
  );
}

function chip(label: string, color: string): HTMLElement {
  const element = h("span", { class: "chip" }, label);
  element.style.setProperty("--chip-color", color);
  return element;
}

function screenshot(record: FeedbackRecord): HTMLElement | null {
  const source = record.screenshotUrl;
  // Only an inline image: this page must not fetch an address a record carries.
  if (!source?.startsWith("data:") || !isSafeImageUrl(source)) return null;
  const figure = h("div", { class: "shot" }, h("img", { src: source, alt: "Screenshot of the annotated area" }));
  const region = record.screenshotRegion;
  if (region) {
    const outline = h("div", { class: "region" });
    outline.style.left = `${region.xPct * 100}%`;
    outline.style.top = `${region.yPct * 100}%`;
    outline.style.width = `${region.wPct * 100}%`;
    outline.style.height = `${region.hPct * 100}%`;
    figure.append(outline);
  }
  return figure;
}

function card(record: FeedbackRecord): HTMLElement {
  const include = h("input", {
    type: "checkbox",
    checked: !excluded.has(record.id),
    "aria-label": "Include in exports",
  });
  include.addEventListener("change", () => {
    if (include.checked) excluded.delete(record.id);
    else excluded.add(record.id);
    renderSummary();
  });

  const status = h(
    "select",
    { "aria-label": "Status" },
    ...FEEDBACK_STATUSES.map((value) => option(value, STATUS_LABEL[value], record.status === value)),
  );
  status.addEventListener("change", () => {
    call(api, { type: "feedback:status", id: record.id, status: status.value as FeedbackStatus }).catch(
      (cause: unknown) => say(message(cause), "error"),
    );
  });

  const remove = h("button", { type: "button", class: "button button-danger" }, "Delete");
  remove.addEventListener("click", () => {
    if (!window.confirm("Delete this feedback? This cannot be undone.")) return;
    call(api, { type: "feedback:delete", id: record.id }).catch((cause: unknown) => say(message(cause), "error"));
  });

  const pageHref = deepLinkUrl(record);
  const pageLabel = `${filters.site === ALL ? siteLabel(record.projectName) : ""}${record.url}`;
  const page = pageHref
    ? h(
        "a",
        {
          href: pageHref,
          target: "_blank",
          rel: "noopener noreferrer",
          title: "Opens the page. Switch SitePing on there to jump to the annotation.",
        },
        pageLabel,
      )
    : h("span", {}, pageLabel);

  const thread =
    (record.comments ?? []).length > 0 &&
    h(
      "ul",
      { class: "thread" },
      ...(record.comments ?? []).map((comment) =>
        h(
          "li",
          {},
          h("small", {}, `${comment.authorName} · ${formatDate(comment.createdAt)}`),
          h("p", {}, comment.body),
        ),
      ),
    );

  const element = h(
    "article",
    { class: "card", "data-id": record.id },
    include,
    h(
      "div",
      { class: "card-body" },
      h(
        "div",
        { class: "card-head" },
        chip(TYPE_LABEL[record.type], TYPE_COLOR[record.type]),
        chip(STATUS_LABEL[record.status], STATUS_COLOR[record.status]),
        h("time", { datetime: record.createdAt.toISOString() }, formatDate(record.createdAt)),
      ),
      h("p", { class: "message" }, record.message),
      h("div", { class: "meta" }, page, h("span", {}, record.authorName), h("span", {}, record.viewport)),
      screenshot(record),
      thread,
      h("div", { class: "actions" }, status, remove),
    ),
  );
  element.style.setProperty("--type-color", TYPE_COLOR[record.type]);
  return element;
}

function renderSummary(): void {
  const visible = shown();
  const selected = selection();
  summary.textContent = summarize(visible, selected);
  for (const button of [exportPdf, sendSlack, copySlack]) {
    button.disabled = selected.length === 0 || running.has(button);
  }
}

function render(): void {
  filters = reconcileFilters(filters, records);
  renderFilters();
  const visible = shown();
  list.replaceChildren(
    ...(visible.length > 0
      ? visible.map(card)
      : [
          h(
            "p",
            { class: "empty" },
            records.length === 0
              ? "No feedback yet. Open a web page, click the SitePing button in the browser toolbar and switch it on, then draw on the page."
              : "No feedback matches these filters.",
          ),
        ]),
  );
  renderSummary();
}

async function reload(): Promise<void> {
  [records, settings] = await Promise.all([readAllRecords(api.storage.local), readSettings(api.storage.local)]);
  render();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Run an export with its button busy; a failure is shown, never thrown at
 * the page. The page redraws while an export runs (a tick, a filter, feedback
 * arriving from another tab), and a redraw must not hand the button back: a
 * second send over the first would post the review twice.
 */
async function busy(button: HTMLButtonElement, label: string, task: () => Promise<void>): Promise<void> {
  if (running.has(button)) return;
  const idle = button.textContent;
  running.add(button);
  button.disabled = true;
  button.textContent = label;
  try {
    await task();
  } catch (cause) {
    say(message(cause), "error");
  } finally {
    running.delete(button);
    button.textContent = idle;
    renderSummary();
  }
}

function download(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const anchor = h("a", { href: url, download: fileName });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // The download reads the blob after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

exportPdf.addEventListener("click", () =>
  busy(exportPdf, "Exporting…", async () => {
    const report = toReport(selection(), new Date());
    const bytes = await buildReportPdf(report, {
      rasterize: rasterizeText,
      toJpeg,
      // Let the page paint and respond between feedback of a long export.
      pause: () => new Promise((resolve) => setTimeout(resolve)),
    });
    const fileName = exportFileName(report);
    download(bytes, fileName);
    say(`Exported ${plural(report.items.length, "item")} to ${fileName}.`);
  }),
);

copySlack.addEventListener("click", () =>
  busy(copySlack, "Copying…", async () => {
    const report = toReport(selection(), new Date());
    const { text, html } = buildClipboard(report);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
    } catch {
      // A browser without rich clipboard support still takes plain text.
      await navigator.clipboard.writeText(text);
    }
    say(`Copied ${plural(report.items.length, "item")}. Paste into a Slack message.`);
  }),
);

sendSlack.addEventListener("click", () => {
  if (!settings.slackWebhookUrl) {
    openSettings("Add your Slack Incoming Webhook to send reviews to Slack.");
    settingsSlack.focus();
    return;
  }
  // What the dialog describes is what gets sent: the messages and the
  // address are fixed now. Feedback arriving from another tab while the
  // dialog is open, or a webhook changed in another window, is not part of
  // what the reviewer agreed to.
  const report = toReport(selection(), new Date());
  confirmedSlack = { webhookUrl: settings.slackWebhookUrl, payloads: buildSlackMessages(report) };
  slackWhat.textContent = `This posts the text of ${plural(report.items.length, "feedback item")} to your Slack webhook: each message, its page address, type, status, author name and date.`;
  slackDialog.showModal();
});

// The dialog's form closes it; this click is also the user gesture a browser
// requires before it shows a permission prompt, so the request starts here
// and not in a later event.
byId<HTMLButtonElement>("slack-confirm").addEventListener("click", () => {
  const confirmed = confirmedSlack;
  confirmedSlack = null;
  if (!confirmed) return;
  const granted = api.permissions.request({ origins: [SLACK_ORIGIN] });
  void busy(sendSlack, "Sending…", async () => {
    if (!(await granted)) throw new Error("Slack was not contacted: access to hooks.slack.com was not granted.");
    await sendToSlack(confirmed.webhookUrl, confirmed.payloads);
    say(`Sent to Slack${confirmed.payloads.length > 1 ? ` in ${confirmed.payloads.length} messages` : ""}.`);
  });
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function openSettings(reason?: string): void {
  settingsName.value = settings.name;
  settingsEmail.value = settings.email;
  settingsSlack.value = settings.slackWebhookUrl;
  settingsError.textContent = reason ?? "";
  settingsError.hidden = !reason;
  settingsDialog.showModal();
}

byId<HTMLButtonElement>("open-settings").addEventListener("click", () => openSettings());
byId<HTMLButtonElement>("settings-cancel").addEventListener("click", () => settingsDialog.close());
byId<HTMLFormElement>("settings-form").addEventListener("submit", (event) => {
  // Stay open until the background accepted the values.
  event.preventDefault();
  call(api, {
    type: "settings:set",
    settings: { name: settingsName.value, email: settingsEmail.value, slackWebhookUrl: settingsSlack.value },
  })
    .then((saved) => {
      settings = saved;
      settingsDialog.close();
      say("Settings saved.");
    })
    .catch((cause: unknown) => {
      settingsError.textContent = message(cause);
      settingsError.hidden = false;
    });
});

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

filterSite.addEventListener("change", () => {
  filters = { ...filters, site: filterSite.value };
  render();
});
filterStatus.addEventListener("change", () => {
  filters = { ...filters, status: filterStatus.value as FeedbackStatus | typeof ALL };
  render();
});
filterType.addEventListener("change", () => {
  filters = { ...filters, type: filterType.value as FeedbackType | typeof ALL };
  render();
});

// Several keys can change in one burst (a bulk delete in a page's panel).
let pending: ReturnType<typeof setTimeout> | undefined;
api.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (!Object.keys(changes).some((key) => isFeedbackKey(key) || key === SETTINGS_KEY)) return;
  clearTimeout(pending);
  pending = setTimeout(() => void reload().catch((cause: unknown) => say(message(cause), "error")), 80);
});

reload().catch((cause: unknown) => say(message(cause), "error"));
