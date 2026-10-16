import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Two documents deliberately share #main, just like Teemay's app shell.
// Exercise the shipped bundle and the real navigation/initial deep-link path.
test("Go to annotation loads the recorded page before focusing its shared anchor", async ({ page }) => {
  const bundle = readFileSync("packages/widget/dist/index.global.js", "utf8");
  const feedback = {
    id: "elsewhere",
    projectName: "test",
    type: "question",
    message: "Should these be clickable?",
    status: "open",
    url: "/talent/person",
    urlPattern: null,
    authorName: "Reviewer",
    authorEmail: "reviewer@example.test",
    viewport: "1280x720",
    userAgent: "test",
    resolvedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    screenshotUrl: null,
    screenshotRegion: null,
    diagnostics: null,
    annotations: [
      {
        id: "ann-1",
        feedbackId: "elsewhere",
        cssSelector: "#main",
        xpath: "/html/body/main",
        textSnippet: "",
        elementTag: "MAIN",
        elementId: "main",
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
        createdAt: new Date().toISOString(),
      },
    ],
  };
  await page.addInitScript(() => {
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
      return attach.call(this, { ...options, mode: "open" });
    };
  });
  await page.route("https://annotation.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/widget.js") return route.fulfill({ contentType: "text/javascript", body: bundle });
    if (url.pathname === "/api/siteping") {
      const feedbacks = !url.searchParams.get("url") || url.searchParams.get("url") === feedback.url ? [feedback] : [];
      return route.fulfill({ json: { feedbacks, total: feedbacks.length } });
    }
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body>
      <main id="main" style="margin-top:1200px;height:500px">${url.pathname}</main>
      <script src="/widget.js"></script><script>
      window.widget = SitePing.initSiteping({ endpoint:'/api/siteping', projectName:'test', forceShow:true,
        deepLink:{param:'focus'}, getPageScope:()=>({url:location.pathname,urlPattern:null}) });
      </script></body></html>`,
    });
  });
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
