import { buildFeedbackRecord, type FeedbackCreateInput, type FeedbackRecord } from "@siteping/core";

let counter = 0;

/** A create input as the widget's `StoreClient` builds one. */
export function createInput(overrides: Partial<FeedbackCreateInput> = {}): FeedbackCreateInput {
  counter += 1;
  return {
    projectName: "https://example.com",
    type: "bug",
    message: `Feedback ${counter}`,
    status: "open",
    url: "/pricing",
    urlPattern: null,
    viewport: "1280x720",
    userAgent: "Mozilla/5.0 (test)",
    authorName: "Ada",
    authorEmail: "ada@example.com",
    clientId: `client-${counter}`,
    annotations: [
      {
        cssSelector: "#main",
        xpath: "/html/body/main",
        textSnippet: "Pricing",
        elementTag: "MAIN",
        elementId: "main",
        textPrefix: "",
        textSuffix: "",
        fingerprint: "1:0:x",
        neighborText: "",
        xPct: 0.1,
        yPct: 0.2,
        wPct: 0.3,
        hPct: 0.4,
        scrollX: 0,
        scrollY: 0,
        viewportW: 1280,
        viewportH: 720,
        devicePixelRatio: 1,
      },
    ],
    screenshotDataUrl: null,
    screenshotRegion: null,
    diagnostics: null,
    ...overrides,
  };
}

/** A record as the store returns one, with a thread. */
export function createRecord(overrides: Partial<FeedbackCreateInput> = {}, at = new Date("2026-11-14T10:00:00Z")) {
  counter += 1;
  const id = `fb-${counter}`;
  let annotation = 0;
  const record: FeedbackRecord = buildFeedbackRecord(createInput(overrides), {
    id,
    annotationId: () => `${id}-a${annotation++}`,
    now: at,
  });
  record.comments = [];
  return record;
}

/** Smallest valid baseline JPEG: one grey pixel. */
export const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=";

export const TINY_JPEG_DATA_URL = `data:image/jpeg;base64,${TINY_JPEG_BASE64}`;
