import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Builder, By } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";

import { chromePath, HEADLESS_ARGS } from "./lib/chrome.mjs";
import {
  assertProbeBundle,
  assertRenderedHealth,
  assertRenderedMetrics,
  sidecarOrigin,
} from "./lib/contract.mjs";

const origin = sidecarOrigin();

describe("selenium sidecar probes", { skip: !origin }, () => {
  let driver;

  before(async () => {
    const options = new chrome.Options();
    options.setChromeBinaryPath(chromePath());
    options.addArguments(
      ...HEADLESS_ARGS,
      `--user-data-dir=/tmp/ores-otel-selenium-${process.pid}`,
    );
    driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .build();
  });

  after(async () => {
    await driver?.quit();
  });

  async function bodyText() {
    return driver.findElement(By.tagName("body")).getText();
  }

  async function collectFromPage() {
    return driver.executeAsyncScript(function (done) {
      const grab = async (path, method = "GET") => {
        const res = await fetch(path, { method, cache: "no-store" });
        const headers = {};
        res.headers.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });
        const body = method === "HEAD" ? "" : await res.text();
        return { status: res.status, headers, body };
      };
      Promise.resolve()
        .then(async () => ({
          healthz: await grab("/healthz"),
          health: await grab("/health"),
          readyz: await grab("/readyz"),
          ready: await grab("/ready"),
          metrics: await grab("/metrics"),
          head: await grab("/healthz", "HEAD"),
          posted: await grab("/healthz", "POST"),
          put: await grab("/healthz", "PUT"),
          missing: await grab("/nope"),
          admin: await grab("/admin"),
          query: await grab("/readyz?foo=1"),
          cookies: document.cookie,
        }))
        .then(done)
        .catch((err) => done({ error: String(err) }));
    });
  }

  it("get /healthz renders JSON", async () => {
    await driver.get(`${origin}/healthz`);
    assertRenderedHealth(await bodyText());
    assert.ok((await driver.getCurrentUrl()).includes("/healthz"));
  });

  it("get /health alias and /readyz", async () => {
    await driver.get(`${origin}/health`);
    assertRenderedHealth(await bodyText());
    await driver.get(`${origin}/readyz`);
    const readyText = await bodyText();
    assert.ok(readyText.includes("ok"), readyText.slice(0, 200));
  });

  it("get /metrics shows the up gauge", async () => {
    await driver.get(`${origin}/metrics`);
    assertRenderedMetrics(await bodyText());
  });

  it("unknown paths are not probes", async () => {
    await driver.get(`${origin}/nope`);
    const missing = await bodyText();
    assert.match(missing.toLowerCase(), /not found|404/);
    await driver.get(`${origin}/admin`);
    const admin = await bodyText();
    assert.match(admin.toLowerCase(), /not found|404/);
  });

  it("in-page fetch covers HEAD, mutations, aliases, and no cookies", async () => {
    await driver.get(`${origin}/healthz`);
    const bundle = await collectFromPage();
    assertProbeBundle(bundle);
    assert.equal(bundle.cookies, "");
  });

  it("query strings still hit /healthz", async () => {
    await driver.get(`${origin}/healthz?x=1`);
    assertRenderedHealth(await bodyText());
  });
});
