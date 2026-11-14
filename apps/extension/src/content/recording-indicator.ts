import { formatRecordingTime, type RecordingState } from "../recording/model.js";
import type { ContentApi } from "../shared/browser.js";
import { call } from "../shared/messages.js";

let element: HTMLDivElement | null = null;
let interval: ReturnType<typeof setInterval> | undefined;
let resultTimeout: ReturnType<typeof setTimeout> | undefined;

export function hideRecordingIndicator(): void {
  clearInterval(interval);
  clearTimeout(resultTimeout);
  element?.remove();
  element = null;
}

export function showRecordingResult(message: string): void {
  hideRecordingIndicator();
  element = document.createElement("div");
  element.dataset.sitepingIgnore = "true";
  element.setAttribute("role", "status");
  element.style.cssText =
    "position:fixed;z-index:2147483647;top:16px;left:50%;transform:translateX(-50%);padding:9px 12px;border:1px solid #cbd5e1;border-radius:999px;background:#fff;color:#0f172a;font:600 13px/1.2 system-ui;box-shadow:0 4px 18px #0003";
  element.textContent = message;
  document.documentElement.append(element);
  const result = element;
  resultTimeout = setTimeout(() => {
    if (element === result) hideRecordingIndicator();
  }, 6000);
}

export function showRecordingIndicator(api: ContentApi, state: RecordingState): void {
  if (state.phase === "idle") {
    hideRecordingIndicator();
    return;
  }
  hideRecordingIndicator();
  const timer = document.createElement("span");
  const stop = document.createElement("button");
  stop.type = "button";
  stop.textContent = "Stop";
  stop.style.cssText =
    "border:1px solid #fecaca;border-radius:6px;background:white;color:#991b1b;padding:4px 8px;cursor:pointer";
  stop.addEventListener("click", () => {
    stop.disabled = true;
    void call(api, { type: "recording:stop", reason: "manual" }).catch(() => {
      stop.disabled = false;
    });
  });
  element = document.createElement("div");
  element.dataset.sitepingIgnore = "true";
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.style.cssText =
    "position:fixed;z-index:2147483647;top:16px;left:50%;transform:translateX(-50%);display:flex;gap:9px;align-items:center;padding:8px 10px;border:1px solid #fecaca;border-radius:999px;background:#fff;color:#7f1d1d;font:600 13px/1.2 system-ui;box-shadow:0 4px 18px #0003";
  const dot = document.createElement("span");
  dot.textContent = "●";
  dot.style.color = "#dc2626";
  const label = document.createElement("span");
  label.textContent = "Recording";
  element.append(dot, label, timer, stop);
  document.documentElement.append(element);
  const update = () => {
    const elapsed = Math.max(0, Date.now() - Date.parse(state.session.startedAt));
    timer.textContent = `${formatRecordingTime(elapsed)} · ${formatRecordingTime(state.session.limitMs - elapsed)} left`;
  };
  update();
  interval = setInterval(update, 1000);
}
