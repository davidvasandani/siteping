import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

// Exercise the shipped bundle and the real navigation/initial deep-link path.

function feedbackAt(url: string, anchor: { id: string; tag: string; xpath: string }) {
  const now = new Date().toISOString();
  return {
    id: "elsewhere",
    projectName: "test",
    type: "question",
    message: "Should these be clickable?",
    status: "open",
    url,
    urlPattern: null,
    authorName: "Reviewer",
    authorEmail: "reviewer@example.test",
    viewport: "1280x720",
    userAgent: "test",
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
    screenshotUrl: null,
    screenshotRegion: null,
    diagnostics: null,
    annotations: [
      {
        id: "ann-1",
        feedbackId: "elsewhere",
        cssSelector: `#${anchor.id}`,
        xpath: anchor.xpath,
        textSnippet: "",
        elementTag: anchor.tag,
        elementId: anchor.id,
        textPrefix: "",
        textSuffix: "",
        fingerprint: "",
        neighborText: "",
        anchorKey: null,
        xPct: 0.1,
        yPct: 0.1,
        wPct: 0.3,
        hPct: 0.2,
        scrollX: 0,
        scrollY: 0,
        viewportW: 1280,
        viewportH: 720,
        devicePixelRatio: 1,
        createdAt: now,
      },
    ],
  };
}

const MAIN = { id: "main", tag: "MAIN", xpath: "/html/body/main" };

/** Serve every path of https://annotation.test as `page(pathname)`, with the widget mounted by `init`. */
async function serveApp(
  page: Page,
  feedback: ReturnType<typeof feedbackAt>,
  html: (pathname: string) => string,
  init: string,
) {
  const bundle = readFileSync("packages/widget/dist/index.global.js", "utf8");
  await page.route("https://annotation.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/widget.js") return route.fulfill({ contentType: "text/javascript", body: bundle });
    if (url.pathname === "/api/siteping") {
      const feedbacks = !url.searchParams.get("url") || url.searchParams.get("url") === feedback.url ? [feedback] : [];
      return route.fulfill({ json: { feedbacks, total: feedbacks.length } });
    }
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="utf-8"></head><body>${html(url.pathname)}
      <script src="/widget.js"></script><script>window.widget = SitePing.initSiteping(${init});</script>
      </body></html>`,
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
      return attach.call(this, { ...options, mode: "open" });
    };
  });
});

// Two documents deliberately share #main, as app shells often do.
test("Go to annotation loads the recorded page before focusing its shared anchor", async ({ page }) => {
  await serveApp(
    page,
    feedbackAt("/talent/person", MAIN),
    (pathname) => `<main id="main" style="margin-top:1200px;height:500px">${pathname}</main>`,
    `{ endpoint:'/api/siteping', projectName:'test', forceShow:true,
       deepLink:{param:'focus'}, getPageScope:()=>({url:location.pathname,urlPattern:null}) }`,
  );
  await page.goto("https://annotation.test/admin/sandbox");
  await page.locator(".sp-fab").click();
  await page.locator('[data-item-id="chat"]').click();
  await page.locator('[data-scope-filter="all"]').click();
  await page.locator('[data-feedback-id="elsewhere"]').click();
  await page.locator(".sp-detail-btn-goto").click();
  await expect(page).toHaveURL("https://annotation.test/talent/person?focus=elsewhere");
  await expect(page.locator("#main")).toHaveText("/talent/person");
  // Deep-link focusing scrolls the destination's offscreen annotation into view.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  await expect(page.locator("#siteping-markers")).toBeAttached();
});

// `defaultPanelScope: "all"` opens the list on every page's feedback, so the
// other page's card is the first thing the reviewer sees.
test("Go to annotation leaves for the recorded page from a panel that opens on all pages", async ({ page }) => {
  await serveApp(
    page,
    feedbackAt("/talent/person", MAIN),
    (pathname) => `<main id="main" style="margin-top:1200px;height:500px">${pathname}</main>`,
    `{ endpoint:'/api/siteping', projectName:'test', forceShow:true, defaultPanelScope:'all',
       deepLink:{param:'focus'}, getPageScope:()=>({url:location.pathname,urlPattern:null}) }`,
  );
  await page.goto("https://annotation.test/admin/sandbox");
  await page.locator(".sp-fab").click();
  await page.locator('[data-item-id="chat"]').click();
  await page.locator('[data-feedback-id="elsewhere"]').click();
  await page.locator(".sp-detail-btn-goto").click();
  await expect(page).toHaveURL("https://annotation.test/talent/person?focus=elsewhere");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
});

// App shell: the document never scrolls, <main> does. Scrolling the body-level
// marker would do nothing (or slide the whole shell).
test("Go to annotation scrolls the anchor's own container on an app shell", async ({ page }) => {
  await serveApp(
    page,
    feedbackAt("/", { id: "target", tag: "SECTION", xpath: "/html/body/main/section" }),
    () => `<style>html,body{margin:0;height:100%;overflow:hidden}</style>
      <main id="shell" style="height:100vh;overflow-y:auto">
        <section id="target" style="margin-top:2400px;height:300px">Deep inside the shell</section>
        <div style="height:1200px"></div>
      </main>`,
    `{ endpoint:'/api/siteping', projectName:'test', forceShow:true }`,
  );
  await page.goto("https://annotation.test/");
  await page.locator(".sp-fab").click();
  await page.locator('[data-item-id="chat"]').click();
  await page.locator('.sp-card[data-feedback-id="elsewhere"]').click();
  expect(await page.locator("#shell").evaluate((el) => el.scrollTop)).toBe(0);
  await page.locator(".sp-detail-btn-goto").click();

  await expect.poll(() => page.locator("#shell").evaluate((el) => el.scrollTop)).toBeGreaterThan(2000);
  await expect(page.locator("#target")).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
