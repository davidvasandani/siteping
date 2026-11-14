/**
 * Screenshot capture for the extension: the real pixels of the tab.
 *
 * `scripts/build.mjs` bundles this module in place of the widget's
 * `screenshot.ts` (an esbuild redirect of the import in `annotator.ts`), so
 * the export below must keep that module's name and type; it is typed
 * `typeof` the original so that a change there fails `tsc` here.
 *
 * Why replace it: the widget re-renders the DOM with html2canvas-pro, which
 * yields nothing when the page shows an image from another site without CORS
 * headers. On a site the reviewer does not control that is the usual case.
 * The browser's own capture of the tab has no such limit. The original stays
 * as the fallback for when the browser refuses the capture.
 */
import {
  type AnnotatedScreenshot,
  type CaptureOptions,
  captureAnnotatedScreenshot as renderFromDom,
} from "../../../../packages/widget/src/screenshot.js";
import { extensionApi } from "../shared/browser.js";
import { call } from "../shared/messages.js";
import { captureArea } from "./capture-area.js";

/**
 * SitePing's own chrome, which must not be in the picture: the shadow host
 * (button, panel), everything outside it that the widget marks to be left
 * out (overlay, drawn rect, comment box, and the page's own masked elements)
 * and the layer of numbered markers.
 */
const CHROME = 'siteping-widget, [data-siteping-ignore="true"], #siteping-markers';

/** How long to wait for the browser to paint before giving up on the frame. */
const PAINT_TIMEOUT_MS = 300;

/**
 * Make the chrome invisible and return the function that puts it back.
 * Opacity rather than `visibility`, which a descendant can override; the
 * transition is switched off so the fade does not show in the capture.
 */
export function hideChrome(root: ParentNode = document): () => void {
  const restore: (() => void)[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(CHROME)) {
    const { style } = element;
    const saved = (["opacity", "transition"] as const).map(
      (name) => [name, style.getPropertyValue(name), style.getPropertyPriority(name)] as const,
    );
    style.setProperty("opacity", "0", "important");
    style.setProperty("transition", "none", "important");
    restore.push(() => {
      for (const [name, value, priority] of saved) {
        if (value) style.setProperty(name, value, priority);
        else style.removeProperty(name);
      }
    });
  }
  return () => {
    for (const undo of restore) undo();
  };
}

/** Resolve once the browser has painted the current state: the second animation frame from now. */
function painted(): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, PAINT_TIMEOUT_MS);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        clearTimeout(timeout);
        resolve();
      }),
    );
  });
}

/** A `data:` URL as a bitmap, decoded in memory: loading it as an image could be blocked by the page's CSP. */
async function decode(dataUrl: string): Promise<ImageBitmap> {
  const [header = "", body = ""] = dataUrl.split(",", 2);
  const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  return createImageBitmap(new Blob([bytes], { type: /^data:([^;]+)/.exec(header)?.[1] ?? "image/png" }));
}

/**
 * Capture the drawn rect with its surroundings from the tab's own pixels.
 * `requestCapture` resolves with a `data:` URL of the visible viewport.
 * `null` when the rect is off screen or no canvas is available; rejects when
 * the capture itself is refused.
 */
export async function captureFromTab(
  rect: DOMRect,
  options: CaptureOptions | undefined,
  requestCapture: () => Promise<string>,
): Promise<AnnotatedScreenshot | null> {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const area = captureArea(rect, viewport);
  if (!area) return null;

  const restore = hideChrome();
  let dataUrl: string;
  try {
    await painted();
    dataUrl = await requestCapture();
  } finally {
    restore();
  }

  const bitmap = await decode(dataUrl);
  try {
    // The capture is in device pixels (and follows the page zoom).
    const scaleX = bitmap.width / viewport.width;
    const scaleY = bitmap.height / viewport.height;
    const sourceWidth = area.width * scaleX;
    const sourceHeight = area.height * scaleY;
    const shrink = Math.min(1, (options?.maxWidth ?? 1200) / sourceWidth);

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * shrink));
    canvas.height = Math.max(1, Math.round(sourceHeight * shrink));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(
      bitmap,
      area.x * scaleX,
      area.y * scaleY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return { dataUrl: canvas.toDataURL("image/jpeg", options?.quality ?? 0.85), region: area.region };
  } finally {
    bitmap.close();
  }
}

export const captureAnnotatedScreenshot: typeof renderFromDom = async (rect, options) => {
  try {
    const api = extensionApi();
    const captured = await captureFromTab(rect, options, async () => (await call(api, { type: "capture" })).dataUrl);
    if (captured) return captured;
  } catch (error) {
    console.warn("[siteping] Tab capture failed, rendering the screenshot from the page instead:", error);
  }
  return renderFromDom(rect, options);
};
