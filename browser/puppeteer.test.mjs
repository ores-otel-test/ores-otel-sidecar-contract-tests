import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import puppeteer from "puppeteer-core";

import { chromePath, HEADLESS_ARGS } from "./lib/chrome.mjs";
import {
  assertHealthJson,
  assertProbeBundle,
  assertRenderedHealth,
  assertRenderedMetrics,
  collectProbeBundle,
  sidecarOrigin,
} from "./lib/contract.mjs";

const origin = sidecarOrigin();

describe("puppeteer sidecar probes", { skip: !origin }, () => {
  let browser;
  let page;

  before(async () => {
    browser = await puppeteer.launch({
      executablePath: chromePath(),
      headless: true,
      args: HEADLESS_ARGS,
    });
    page = await browser.newPage();
  });

  after(async () => {
    await browser?.close();
  });

  it("goto /healthz renders JSON", async () => {
    const response = await page.goto(`${origin}/healthz`, {
      waitUntil: "domcontentloaded",
    });
    assert.equal(response.status(), 200);
    assert.match(response.headers()["content-type"] || "", /json/i);
    assert.equal(response.headers()["cache-control"], "no-store");
    assert.equal(response.headers()["x-content-type-options"], "nosniff");
    assertRenderedHealth(await page.$eval("body", (el) => el.innerText));
  });

  it("goto /health alias and /readyz", async () => {
    const health = await page.goto(`${origin}/health`, {
      waitUntil: "domcontentloaded",
    });
    assert.equal(health.status(), 200);
    assertHealthJson(health.status(), await health.text());
    const readyz = await page.goto(`${origin}/readyz`, {
      waitUntil: "domcontentloaded",
    });
    assert.ok([200, 503].includes(readyz.status()));
    assert.ok("ok" in JSON.parse(await readyz.text()));
  });

  it("goto /metrics shows the up gauge", async () => {
    const response = await page.goto(`${origin}/metrics`, {
      waitUntil: "domcontentloaded",
    });
    assert.equal(response.status(), 200);
    assertRenderedMetrics(await page.$eval("body", (el) => el.innerText));
  });

  it("unknown paths are 404", async () => {
    const missing = await page.goto(`${origin}/nope`, {
      waitUntil: "domcontentloaded",
    });
    assert.equal(missing.status(), 404);
    const admin = await page.goto(`${origin}/admin`, {
      waitUntil: "domcontentloaded",
    });
    assert.equal(admin.status(), 404);
  });

  it("in-page fetch covers HEAD, mutations, aliases, and no cookies", async () => {
    await page.goto(`${origin}/healthz`, { waitUntil: "domcontentloaded" });
    const bundle = await page.evaluate(collectProbeBundle);
    assertProbeBundle(bundle);
    assert.equal(bundle.cookies, "");
  });

  it("query strings still hit /healthz", async () => {
    const response = await page.goto(`${origin}/healthz?x=1`, {
      waitUntil: "domcontentloaded",
    });
    assertHealthJson(response.status(), await response.text());
  });
});
