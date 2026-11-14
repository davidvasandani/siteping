import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type BrowserContext, test as base, chromium, expect, type Page, type Worker } from "@playwright/test";

/**
 * The browser extension (apps/extension), loaded unpacked in Chromium:
 * switch it on for a page, annotate, find the feedback in the review page,
 * export it to PDF and to Slack.
 *
 * Two things stand in for what a test cannot do:
 *
 * - Nobody can click the browser's toolbar from here, and that click is
 *   what grants the extension access to a tab (`activeTab`). The test loads
 *   a copy of the build whose manifest also holds `<all_urls>`, and opens
 *   the popup as a page with the tab's id in its address. The shipped
 *   manifest is asserted in apps/extension/__tests__/build.test.ts.
 * - Slack is a routed stand-in at the real webhook address.
 *
 * Chromium only: the other browsers do not load an unpacked extension here.
 * Locally, point SITEPING_CHROMIUM at a Chromium binary (the one Playwright
 * downloads lacks libraries on NixOS).
 */

/**
 * What the snippets evaluated in the extension's service worker call. Declared
 * here because this spec compiles under the repository's root config, which
 * carries no extension typings.
 */
declare const chrome: {
  tabs: { query(query: { url: string }): Promise<{ id?: number }[]> };
  storage: { local: { get(keys: null): Promise<Record<string, unknown>> } };
};

const BUILD = fileURLToPath(new URL("../apps/extension/dist/chrome", import.meta.url));
const WEBHOOK = "https://hooks.slack.com/services/T000/B000/e2e";
const GREEN = [0, 170, 85] as const;

const page1 = (other: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture</title>
<style>body{margin:0;font:16px system-ui;background:#fff} main{padding:40px}
#box{width:420px;height:180px;background:rgb(${GREEN.join(",")});margin:20px 0}</style></head>
<body><main><h1>Fixture home</h1><p>A page the extension knows nothing about.</p>
<div id="box"></div><img id="remote" alt="" width="120" height="60" src="${other}/pixel.svg">
<p><a id="next" href="/second?utm_source=test">Second page</a>
<button id="spa" onclick="history.pushState(null,'','/spa')">Client-side route</button></p></main></body></html>`;

const page2 = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Second</title></head>
<body><main style="padding:40px;font:16px system-ui"><h1>Second page</h1><a id="home" href="/">Home</a></main></body></html>`;

function serve(handler: (path: string) => { type: string; body: string } | null): Promise<Server> {
  const server = createServer((request, response) => {
    const found = handler(new URL(request.url ?? "/", "http://x").pathname);
    response.writeHead(found ? 200 : 404, { "Content-Type": found?.type ?? "text/plain" });
    response.end(found?.body ?? "not found");
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const origin = (server: Server): string => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

interface Fixtures {
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  sites: { main: string; other: string };
}

const test = base.extend<Fixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixture's dependencies from this pattern
  sites: async ({}, use) => {
    // A second origin: an image the page embeds without CORS headers, and a second site to review.
    const other = await serve((path) =>
      path === "/pixel.svg"
        ? {
            type: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#d01f1f"/></svg>',
          }
        : { type: "text/html", body: page2 },
    );
    const main = await serve((path) =>
      path === "/" || path === "/spa"
        ? { type: "text/html", body: page1(origin(other)) }
        : path === "/second"
          ? { type: "text/html", body: page2 }
          : null,
    );
    await use({ main: origin(main), other: origin(other) });
    main.close();
    other.close();
  },

  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixture's dependencies from this pattern
  context: async ({}, use) => {
    const work = mkdtempSync(join(tmpdir(), "siteping-extension-"));
    const extension = join(work, "extension");
    cpSync(BUILD, extension, { recursive: true });
    const manifestPath = join(extension, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, host_permissions: ["<all_urls>"] }));

    // biome-ignore lint/suspicious/noUndeclaredEnvVars: Playwright runs outside Turborepo, and no cached task reads this
    const executablePath = process.env.SITEPING_CHROMIUM;
    const context = await chromium.launchPersistentContext(join(work, "profile"), {
      // Extensions need the full browser, not the headless shell.
      ...(executablePath ? { executablePath } : { channel: "chromium" }),
      headless: true,
      viewport: { width: 1280, height: 720 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    await use(context);
    await context.close();
    rmSync(work, { recursive: true, force: true });
  },

  worker: async ({ context }, use) => {
    await use(context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker")));
  },

  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
});

test.skip(({ browserName }) => browserName !== "chromium", "The extension is loaded in Chromium only");
test.skip(!existsSync(join(BUILD, "manifest.json")), "apps/extension is not built");

/**
 * Evaluate in the content script's isolated world, where the extension API
 * can open the widget's closed shadow root. The button and its menu live in
 * there; everything else of the widget is ordinary page DOM.
 */
async function inContentWorld(page: Page, expression: string): Promise<unknown> {
  const session = await page.context().newCDPSession(page);
  const worlds: number[] = [];
  session.on("Runtime.executionContextCreated", ({ context }) => {
    if (context.auxData?.type === "isolated" && context.name === "SitePing") worlds.push(context.id);
  });
  await session.send("Runtime.enable");
  const contextId = worlds.at(-1);
  if (contextId === undefined) throw new Error("The content script's world was not found");
  const { result, exceptionDetails } = await session.send("Runtime.evaluate", {
    contextId,
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  await session.detach();
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

const clickInWidget = (page: Page, selector: string): Promise<unknown> =>
  inContentWorld(
    page,
    `(async () => {
      const root = chrome.dom.openOrClosedShadowRoot(document.querySelector("siteping-widget"));
      for (let attempt = 0; attempt < 100; attempt++) {
        const element = root.querySelector(${JSON.stringify(selector)});
        if (element) return element.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("not found in the widget: " + ${JSON.stringify(selector)});
    })()`,
  );

/** Switch SitePing on or off for `page` through the popup, as the toolbar button would. */
async function setEnabled(page: Page, worker: Worker, extensionId: string, enabled: boolean): Promise<Page> {
  const tabId = await worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]?.id, `${page.url()}*`);
  const popup = await page.context().newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
  const toggle = popup.getByRole("checkbox", { name: /Annotate this page/ });
  await expect(toggle).toBeEnabled();
  await toggle.setChecked(enabled);
  await expect(toggle).toBeEnabled();
  await page.bringToFront();
  return popup;
}

/** Draw a rectangle over `selector` and send feedback about it. */
async function annotate(page: Page, selector: string, message: string): Promise<void> {
  await clickInWidget(page, ".sp-fab");
  await clickInWidget(page, '[data-item-id="annotate"]');
  await page.waitForFunction(() => !!document.querySelector("div[style*='crosshair']"));

  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} is not on the page`);
  await page.mouse.move(box.x + 40, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 40, box.y + box.height - 30, { steps: 5 });
  await page.mouse.up();

  const dialog = page.locator('body > [role="dialog"][data-siteping-ignore]');
  await dialog.locator("button[data-type='bug']").click();
  await dialog.locator("textarea").fill(message);
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog).toBeHidden();
}

const markers = (page: Page) => page.locator("#siteping-markers > *");

test("annotate a page, review it, export to PDF and Slack", async ({ context, worker, extensionId, sites }) => {
  test.setTimeout(90_000);

  // Everything the browser requests, to show that nothing leaves the machine.
  const requested: string[] = [];
  context.on("request", (request) => requested.push(request.url()));

  const page = await context.newPage();
  await page.goto(`${sites.main}/`);
  await expect(page.locator("h1")).toHaveText("Fixture home");

  await test.step("the page is untouched until SitePing is switched on", async () => {
    await page.waitForLoadState("load");
    await expect(page.locator("siteping-widget")).toHaveCount(0);
    expect(await worker.evaluate(() => chrome.storage.local.get(null))).toEqual({});
  });

  const message = "The box is the wrong green.\nこのボタンが動きません 🙂 <!channel>";
  await test.step("switch on and annotate", async () => {
    const popup = await setEnabled(page, worker, extensionId, true);
    await popup.close();
    await expect(page.locator("siteping-widget")).toBeAttached();
    await annotate(page, "#box", message);
    await expect(markers(page)).toHaveCount(1);
  });

  await test.step("the feedback survives a reload, with SitePing still on", async () => {
    await page.reload();
    await expect(page.locator("siteping-widget")).toBeAttached();
    await expect(markers(page)).toHaveCount(1);
  });

  await test.step("markers belong to their page, across loads and client-side routes", async () => {
    await page.locator("#next").click();
    await expect(page.locator("h1")).toHaveText("Second page");
    await expect(page.locator("siteping-widget")).toBeAttached();
    await expect(markers(page)).toHaveCount(0);

    await page.locator("#home").click();
    await expect(markers(page)).toHaveCount(1);

    await page.locator("#spa").click();
    await expect(markers(page)).toHaveCount(0);
    await page.goBack();
    await expect(markers(page)).toHaveCount(1);
  });

  const review = await context.newPage();
  await test.step("the review page lists it with a true screenshot", async () => {
    await review.goto(`chrome-extension://${extensionId}/review.html`);
    const card = review.locator("article.card");
    await expect(card).toHaveCount(1);
    await expect(card.locator(".message")).toHaveText(message);
    await expect(card.locator(".chip").first()).toHaveText("Bug");
    await expect(card.locator(".meta a")).toHaveAttribute("href", new RegExp(`^${sites.main}/\\?siteping=`));

    // The centre of the marked region is the page's green box, not SitePing's
    // overlay, and the capture is the tab's own pixels.
    const sample = await card.locator(".shot").evaluate(async (figure) => {
      const image = figure.querySelector("img") as HTMLImageElement;
      await image.decode();
      const region = (figure.querySelector(".region") as HTMLElement).style;
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context2d = canvas.getContext("2d") as CanvasRenderingContext2D;
      context2d.drawImage(image, 0, 0);
      const x = ((Number.parseFloat(region.left) + Number.parseFloat(region.width) / 2) / 100) * canvas.width;
      const y = ((Number.parseFloat(region.top) + Number.parseFloat(region.height) / 2) / 100) * canvas.height;
      return [...context2d.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)];
    });
    for (const [channel, value] of sample.entries())
      expect(Math.abs(value - (GREEN[channel] as number))).toBeLessThan(12);
  });

  await test.step("an image from another site is in the screenshot", async () => {
    await page.bringToFront();
    await annotate(page, "#remote", "Cross-origin image");
    await expect(markers(page)).toHaveCount(2);

    // No reload: the review page follows storage.
    const card = review.locator("article.card").first();
    await expect(review.locator("article.card")).toHaveCount(2);
    await expect(card.locator(".message")).toHaveText("Cross-origin image");
    const reds = await card.locator(".shot img").evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context2d = canvas.getContext("2d") as CanvasRenderingContext2D;
      context2d.drawImage(image, 0, 0);
      const { data } = context2d.getImageData(0, 0, canvas.width, canvas.height);
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if ((data[i] as number) > 180 && (data[i + 1] as number) < 70 && (data[i + 2] as number) < 70) count += 1;
      }
      return count;
    });
    expect(reds).toBeGreaterThan(200);
  });

  await test.step("a second site is reviewed apart", async () => {
    const second = await context.newPage();
    await second.goto(`${sites.other}/`);
    const popup = await setEnabled(second, worker, extensionId, true);
    await popup.close();
    await expect(second.locator("siteping-widget")).toBeAttached();
    await annotate(second, "h1", "Heading on the other site");
    await second.close();

    await review.bringToFront();
    await expect(review.locator("article.card")).toHaveCount(3);
    await review.locator("#filter-site").selectOption(sites.main);
    await expect(review.locator("article.card")).toHaveCount(2);
    await expect(review.locator("#summary")).toHaveText("2 shown · 2 open");
  });

  await test.step("export to PDF", async () => {
    const [download] = await Promise.all([
      review.waitForEvent("download"),
      review.getByRole("button", { name: "Export PDF" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^siteping-127\.0\.0\.1-\d+-\d{4}-\d{2}-\d{2}\.pdf$/);
    const pdf = readFileSync(await download.path()).toString("latin1");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    // Two screenshots as JPEG, and the Japanese line, which the standard
    // fonts cannot write, as raw pixels.
    expect(pdf.match(/\/Filter \/DCTDecode/g)).toHaveLength(2);
    expect(pdf.match(/\/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/FlateDecode/g)?.length).toBeGreaterThan(
      0,
    );
    expect(pdf).toContain(`/URI (${sites.main}/)`);
    await expect(review.locator("#notice")).toContainText("Exported 2 items");
  });

  await test.step("copy for Slack", async () => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await review.getByRole("button", { name: "Copy for Slack" }).click();
    await expect(review.locator("#notice")).toContainText("Copied 2 items");
    const copied = await review.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("SitePing feedback");
    expect(copied).toContain("> The box is the wrong green.");
  });

  await test.step("send to Slack, after saying what is sent", async () => {
    const posted: { text: string; blocks: { type: string; text?: { text: string } }[] }[] = [];
    // Slack answers only when the test lets it, to look at the page mid-send.
    let answer = (): void => {};
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    await context.route("https://hooks.slack.com/**", async (route) => {
      posted.push(route.request().postDataJSON());
      await answered;
      await route.fulfill({ status: 200, body: "ok" });
    });

    // Without a webhook the button leads to the settings.
    await review.getByRole("button", { name: "Send to Slack" }).click();
    const settings = review.locator("dialog#settings");
    await expect(settings).toBeVisible();
    await settings.getByLabel("Slack Incoming Webhook").fill("https://example.com/not-slack");
    await settings.getByRole("button", { name: "Save" }).click();
    await expect(settings.locator("#settings-error")).toContainText("must be an Incoming Webhook");
    await settings.getByLabel("Your name", { exact: true }).fill("Ada");
    await settings.getByLabel("Slack Incoming Webhook").fill(WEBHOOK);
    await settings.getByRole("button", { name: "Save" }).click();
    await expect(settings).toBeHidden();

    await review.getByRole("button", { name: "Send to Slack" }).click();
    const confirm = review.locator("dialog#slack");
    await expect(confirm.locator("#slack-what")).toContainText("the text of 2 feedback items to your Slack webhook");
    await expect(confirm).toContainText("Screenshots are not sent");
    expect(posted).toEqual([]);

    // Feedback that arrives while the confirmation is open appears in the
    // list, but is not part of what the confirmation described.
    await page.bringToFront();
    await annotate(page, "h1", "Arrived after the confirmation opened");
    await review.bringToFront();
    await expect(review.locator("article.card")).toHaveCount(3);
    await expect(confirm.locator("#slack-what")).toContainText("the text of 2 feedback items");
    await confirm.getByRole("button", { name: "Send" }).click();

    // While the send is in flight, a redraw must not offer the button again.
    const sending = review.locator("#send-slack");
    await expect(sending).toHaveText("Sending…");
    await expect(sending).toBeDisabled();
    const include = review.locator("article.card").first().getByLabel("Include in exports");
    await include.uncheck();
    await include.check();
    await expect(sending).toBeDisabled();
    answer();
    await expect(review.locator("#notice")).toHaveText("Sent to Slack.");
    await expect(sending).toBeEnabled();

    expect(posted).toHaveLength(1);
    const texts = posted[0]?.blocks.flatMap((block) => (block.type === "section" ? [block.text?.text ?? ""] : []));
    expect(texts).toHaveLength(2);
    // Reviewer text arrives escaped: no mention.
    expect(texts?.[1]).toContain("&lt;!channel&gt;");
    expect(texts?.[1]).toContain(`<${sites.main}/|/>`);
  });

  await test.step("a refusal from Slack is reported", async () => {
    await context.unroute("https://hooks.slack.com/**");
    await context.route("https://hooks.slack.com/**", (route) => route.fulfill({ status: 404, body: "no_service" }));
    await review.getByRole("button", { name: "Send to Slack" }).click();
    await review.locator("dialog#slack").getByRole("button", { name: "Send" }).click();
    await expect(review.locator("#notice")).toHaveText("Slack answered 404: no_service. Nothing was sent.");
  });

  await test.step("change a status and delete from the review page", async () => {
    const card = review.locator("article.card").first();
    await card.getByLabel("Status").selectOption("resolved");
    await expect(review.locator("article.card").first().locator(".chip").nth(1)).toHaveText("Resolved");

    review.once("dialog", (dialog) => void dialog.accept());
    await review.locator("article.card").first().getByRole("button", { name: "Delete" }).click();
    await expect(review.locator("article.card")).toHaveCount(2);
  });

  await test.step("switch off: the widget leaves the page", async () => {
    const popup = await setEnabled(page, worker, extensionId, false);
    await popup.close();
    await expect(page.locator("siteping-widget")).toHaveCount(0);
    await page.reload();
    await expect(page.locator("h1")).toHaveText("Fixture home");
    await expect(page.locator("siteping-widget")).toHaveCount(0);
  });

  // The fixture sites, the extension's own pages, and Slack at the send: nothing else.
  const elsewhere = requested.filter(
    (url) =>
      !url.startsWith(sites.main) &&
      !url.startsWith(sites.other) &&
      !url.startsWith(`chrome-extension://${extensionId}/`) &&
      !url.startsWith("data:") &&
      !url.startsWith("blob:") &&
      !url.startsWith("https://hooks.slack.com/"),
  );
  expect(elsewhere).toEqual([]);
});

test("says so on a page it cannot run on", async ({ context, extensionId }) => {
  const popup = await context.newPage();
  // The popup's own tab is an extension page: not a web page.
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole("alert")).toHaveText("SitePing can't run on this page.");
  await expect(popup.getByRole("checkbox")).toBeDisabled();
  await expect(popup.getByRole("button", { name: "Review and export" })).toBeEnabled();
});
