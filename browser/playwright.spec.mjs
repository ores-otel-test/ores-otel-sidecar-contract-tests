import { expect, test } from "@playwright/test";

import {
  assertHealthJson,
  assertProbeBundle,
  assertRenderedHealth,
  assertRenderedMetrics,
  collectProbeBundle,
  sidecarOrigin,
} from "./lib/contract.mjs";

const live = Boolean(sidecarOrigin());

test.describe("playwright sidecar probes", () => {
  test.skip(!live, "SIDECAR_URL not set");

  test("goto /healthz renders JSON without secrets", async ({ page }) => {
    const response = await page.goto("/healthz", { waitUntil: "domcontentloaded" });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"] || "").toContain("json");
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    assertRenderedHealth(await page.locator("body").innerText());
  });

  test("goto /health alias matches /healthz", async ({ page }) => {
    const healthz = await page.goto("/healthz", { waitUntil: "domcontentloaded" });
    expect(healthz.status()).toBe(200);
    const a = JSON.parse(await healthz.text());
    const health = await page.goto("/health", { waitUntil: "domcontentloaded" });
    expect(health.status()).toBe(200);
    const b = JSON.parse(await health.text());
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.service).toBe(b.service);
  });

  test("goto /readyz and /ready stay on the ready contract", async ({ page }) => {
    const readyz = await page.goto("/readyz", { waitUntil: "domcontentloaded" });
    expect([200, 503]).toContain(readyz.status());
    expect(JSON.parse(await readyz.text())).toHaveProperty("ok");
    const ready = await page.goto("/ready", { waitUntil: "domcontentloaded" });
    expect([200, 503]).toContain(ready.status());
  });

  test("goto /metrics shows the up gauge", async ({ page }) => {
    const response = await page.goto("/metrics", { waitUntil: "domcontentloaded" });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"] || "").toContain("text/plain");
    assertRenderedMetrics(await page.locator("body").innerText());
  });

  test("goto unknown and traversal-normalized paths are not probes", async ({ page }) => {
    const missing = await page.goto("/nope", { waitUntil: "domcontentloaded" });
    expect(missing.status()).toBe(404);
    const admin = await page.goto("/admin", { waitUntil: "domcontentloaded" });
    expect(admin.status()).toBe(404);
    const traversal = await page.goto("/healthz/../secret", {
      waitUntil: "domcontentloaded",
    });
    expect(traversal.status()).not.toBe(200);
  });

  test("in-page fetch covers HEAD, mutations, aliases, and no cookies", async ({
    page,
  }) => {
    await page.goto("/healthz", { waitUntil: "domcontentloaded" });
    const bundle = await page.evaluate(collectProbeBundle);
    assertProbeBundle(bundle);
    expect(bundle.cookies).toBe("");
  });

  test("query strings do not mint extra routes", async ({ page }) => {
    const response = await page.goto("/healthz?x=1", { waitUntil: "domcontentloaded" });
    expect(response.status()).toBe(200);
    assertHealthJson(response.status(), await response.text());
  });

  test("page stays same-origin and sets no cookies", async ({ page, context }) => {
    await page.goto("/healthz", { waitUntil: "domcontentloaded" });
    expect(page.url()).toContain("/healthz");
    expect(await context.cookies()).toEqual([]);
  });
});
