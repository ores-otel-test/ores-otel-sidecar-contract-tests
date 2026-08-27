export const PROBE_PATHS = ["/healthz", "/health", "/readyz", "/ready", "/metrics"];

export function sidecarOrigin() {
  const raw = (process.env.SIDECAR_URL || "").trim().replace(/\/$/, "");
  return raw || null;
}

export function requireSidecarOrigin() {
  const origin = sidecarOrigin();
  if (!origin) {
    throw new Error("SIDECAR_URL is required (e.g. http://127.0.0.1:9090)");
  }
  return origin;
}

/** Runs inside the page after navigating to the sidecar origin. */
export async function collectProbeBundle() {
  const grab = async (path, method = "GET") => {
    const res = await fetch(path, { method, cache: "no-store" });
    const headers = {};
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const body = method === "HEAD" ? "" : await res.text();
    return { status: res.status, headers, body };
  };
  return {
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
  };
}

function parseJson(body) {
  return JSON.parse(body);
}

export function assertHealthJson(status, body) {
  if (status !== 200) {
    throw new Error(`expected health 200, got ${status}: ${body}`);
  }
  const payload = parseJson(body);
  if (payload.ok !== true) {
    throw new Error(`health ok is ${payload.ok}`);
  }
  if (typeof payload.service !== "string" || !payload.service) {
    throw new Error("health.service missing");
  }
  const encoded = JSON.stringify(payload).toLowerCase();
  for (const secret of ["token", "password", "authorization"]) {
    if (Object.hasOwn(payload, secret) || encoded.includes(`"${secret}"`)) {
      throw new Error(`health payload must not include ${secret}`);
    }
  }
  return payload;
}

export function assertProbeBundle(bundle) {
  if (bundle.error) {
    throw new Error(bundle.error);
  }
  assertHealthJson(bundle.healthz.status, bundle.healthz.body);
  assertHealthJson(bundle.health.status, bundle.health.body);

  if (![200, 503].includes(bundle.readyz.status)) {
    throw new Error(`readyz status ${bundle.readyz.status}`);
  }
  if (!("ok" in parseJson(bundle.readyz.body))) {
    throw new Error("readyz json missing ok");
  }
  if (![200, 503].includes(bundle.ready.status)) {
    throw new Error(`ready status ${bundle.ready.status}`);
  }

  if (bundle.metrics.status !== 200) {
    throw new Error(`metrics status ${bundle.metrics.status}`);
  }
  if (!bundle.metrics.body.includes("ores_otel_sidecar_up")) {
    throw new Error("metrics missing ores_otel_sidecar_up");
  }
  const metricsType = bundle.metrics.headers["content-type"] || "";
  if (metricsType && !metricsType.includes("text/plain")) {
    throw new Error(`metrics content-type ${metricsType}`);
  }

  if (bundle.head.status !== 200) {
    throw new Error(`HEAD /healthz status ${bundle.head.status}`);
  }
  if (bundle.head.body) {
    throw new Error("HEAD /healthz must omit a body");
  }

  if (![400, 405].includes(bundle.posted.status)) {
    throw new Error(`POST /healthz status ${bundle.posted.status}`);
  }
  if (![400, 405].includes(bundle.put.status)) {
    throw new Error(`PUT /healthz status ${bundle.put.status}`);
  }
  if (bundle.missing.status !== 404) {
    throw new Error(`GET /nope status ${bundle.missing.status}`);
  }
  if (bundle.admin.status !== 404) {
    throw new Error(`GET /admin status ${bundle.admin.status}`);
  }
  if (![200, 503].includes(bundle.query.status)) {
    throw new Error(`query string created a new route: ${bundle.query.status}`);
  }

  const headers = bundle.healthz.headers;
  const cache = headers["cache-control"];
  if (cache && cache !== "no-store") {
    throw new Error(`cache-control ${cache}`);
  }
  const nosniff = headers["x-content-type-options"];
  if (nosniff && nosniff !== "nosniff") {
    throw new Error(`x-content-type-options ${nosniff}`);
  }
  const contentType = headers["content-type"] || "";
  if (!contentType.includes("json")) {
    throw new Error(`health content-type ${contentType}`);
  }
  if (bundle.cookies) {
    throw new Error(`probe must not set document.cookie: ${bundle.cookies}`);
  }
  return bundle;
}

export function assertRenderedHealth(text) {
  if (!text.includes('"ok"')) {
    throw new Error(`rendered health missing ok: ${text.slice(0, 200)}`);
  }
  if (!text.toLowerCase().includes("ores-otel-sidecar") && !text.includes('"ok":true')) {
    throw new Error(`rendered health missing service: ${text.slice(0, 200)}`);
  }
}

export function assertRenderedMetrics(text) {
  if (!text.includes("ores_otel_sidecar_up")) {
    throw new Error(`rendered metrics missing gauge: ${text.slice(0, 200)}`);
  }
}
