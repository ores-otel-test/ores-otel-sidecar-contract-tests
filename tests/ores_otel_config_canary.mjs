import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const runtimeRoot = process.env.ORES_OTEL_RUNTIME;
const consumersRoot = process.env.ORES_OTEL_CONSUMERS;
if (!runtimeRoot || !consumersRoot) {
  throw new Error('ORES_OTEL_RUNTIME and ORES_OTEL_CONSUMERS are required');
}

const configApi = await import(pathToFileURL(join(runtimeRoot, 'dist/config.js')).href);
const {
  parseOresOtelToml,
  resolveOresOtelConfig,
  resolveOresOtelExporterEndpoint,
} = configApi;

async function consumer(name) {
  return readFile(join(consumersRoot, name, '.ores-otel.toml'), 'utf8');
}

test('HHaus same-repo client/server policy requires explicit role selection', async () => {
  const parsed = parseOresOtelToml(await consumer('hhaus-lib-core'));
  assert.throws(
    () => resolveOresOtelConfig(parsed, { env: {} }),
    /both client and server sections exist/u,
  );

  const client = resolveOresOtelConfig(parsed, { role: 'client', env: {} });
  const server = resolveOresOtelConfig(parsed, { role: 'server', env: {} });
  assert.equal(client.role, 'client');
  assert.equal(client.serviceName, 'hhaus-client');
  assert.equal(client.logging.level, 'warn');
  assert.equal(server.role, 'server');
  assert.equal(server.serviceName, 'hhaus-server');
  assert.equal(server.logging.level, 'info');
});

test('Fiducia server policy infers server role and keeps exporter endpoint env-only', async () => {
  const parsed = parseOresOtelToml(await consumer('fiducia-telemetry'));
  const resolved = resolveOresOtelConfig(parsed, { env: {} });
  assert.equal(resolved.role, 'server');
  assert.equal(resolved.serviceName, 'fiducia-telemetry');
  assert.equal(resolved.exporter.protocol, 'otlp_grpc');
  assert.equal(resolved.exporter.endpointEnv, 'OTEL_EXPORTER_OTLP_ENDPOINT');
  assert.equal(resolveOresOtelExporterEndpoint(resolved, {}), undefined);
  assert.equal(
    resolveOresOtelExporterEndpoint(resolved, {
      OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector.test.invalid:4317',
    }),
    'https://collector.test.invalid:4317',
  );
});

test('secret-shaped and unknown keys fail closed before telemetry starts', async () => {
  const source = await consumer('fiducia-telemetry');
  assert.throws(
    () => parseOresOtelToml(source.replace(
      'endpoint_env = "OTEL_EXPORTER_OTLP_ENDPOINT"',
      'endpoint_env = "OTEL_EXPORTER_OTLP_ENDPOINT"\nauthorization = "do-not-store"',
    )),
    /forbidden/u,
  );
  assert.throws(
    () => parseOresOtelToml(source.replace(
      'service_name = "fiducia-telemetry"',
      'service_name = "fiducia-telemetry"\nservice = "typo"',
    )),
    /not a supported/u,
  );
});

test('literal exporter endpoints are rejected; only env-variable names are admitted', async () => {
  const source = await consumer('fiducia-telemetry');
  const mutated = source.replace(
    'endpoint_env = "OTEL_EXPORTER_OTLP_ENDPOINT"',
    'endpoint_env = "https://collector.invalid/v1/traces"',
  );
  assert.throws(() => parseOresOtelToml(mutated), /uppercase environment-variable name/u);
});

test('trace sampling stays bounded and propagators stay unique/allowlisted', async () => {
  const source = await consumer('hhaus-lib-core');
  assert.throws(
    () => parseOresOtelToml(source.replace('sample_ratio = 0.1', 'sample_ratio = 1.01')),
    /between 0 and 1/u,
  );
  assert.throws(
    () => parseOresOtelToml(source.replace(
      'propagators = ["tracecontext", "baggage"]',
      'propagators = ["tracecontext", "tracecontext"]',
    )),
    /must not contain duplicates/u,
  );
  assert.throws(
    () => parseOresOtelToml(source.replace(
      'propagators = ["tracecontext", "baggage"]',
      'propagators = ["tracecontext", "x-vendor"]',
    )),
    /unsupported value/u,
  );
});
