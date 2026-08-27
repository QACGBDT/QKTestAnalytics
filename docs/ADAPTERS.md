# Adapter SDK

QKTestAnalytics adapters translate test-runner lifecycle information into a small, versioned event contract. The contract keeps runner APIs out of core storage, analytics and presentation code.

## Event contract

Every event emitted by `ReporterRuntime` has:

```js
{
  version: '1.0',
  sequence: 1,
  type: 'scenario:start',
  source: 'wdio-cucumber',
  timestamp: '2026-08-26T12:00:00.000Z',
  payload: {}
}
```

Supported event types are exported through `ReporterEventType`:

- `run:start`, `run:end`
- `feature:start`, `feature:end`
- `scenario:start`, `scenario:end`
- `step:start`, `step:end`
- `evidence`

A **producer adapter** owns runner-specific hooks and calls `runtime.emit(...)`. A **sink** implements `handle(event)` and persists, exports or analyzes those runner-neutral events. Sinks are executed sequentially so lifecycle ordering is deterministic.

## Minimal custom adapter

```js
import {
  ReporterEventType,
  ReporterRuntime
} from '@qacg/qk-test-analytics/adapters';

const runtime = new ReporterRuntime({
  source: 'my-runner',
  sinks: [
    async event => {
      // Persist or forward the canonical event.
      console.log(event.type, event.payload);
    }
  ]
});

export const adapter = {
  name: 'my-runner',
  hooks: {
    async testStarted(test) {
      await runtime.emit(ReporterEventType.SCENARIO_START, {
        scenarioId: test.id,
        name: test.name,
        featureName: test.suite
      });
    },
    async testFinished(test, result) {
      await runtime.emit(ReporterEventType.SCENARIO_END, {
        scenarioId: test.id,
        status: result.passed ? 'PASSED' : 'FAILED',
        durationMs: result.duration
      });
    }
  }
};
```

Adapters should never import a runner global into `src/core`. Runner objects belong inside the adapter and should be passed explicitly by the runner lifecycle.

## WebdriverIO + Cucumber

The official WDIO/Cucumber integration uses WebdriverIO configuration hooks. WebdriverIO passes the browser/session instance into `before(capabilities, specs, browser)`, so QKTestAnalytics stores that instance inside the adapter rather than reading a global `browser` object.

```js
import { createWdioCucumberAdapter } from '@qacg/qk-test-analytics/adapters/wdio-cucumber';

const qkta = createWdioCucumberAdapter({
  capture: 'on-failure'
});

export const config = {
  framework: 'cucumber',
  // ...normal WDIO configuration
  ...qkta.hooks
};
```

The exposed hook surface is:

- `before`
- `after`
- `beforeFeature` / `afterFeature`
- `beforeScenario` / `afterScenario`
- `beforeStep` / `afterStep`

### Evidence

Screenshot policy is configured with `capture`:

- `never`
- `on-failure` (default)
- `always`

Screenshots use the session passed to the WDIO `before` hook and its `takeScreenshot()` method. Capture failures are recorded on the step and do not change the test result. Use `onEvidenceError` if the framework wants to surface those failures elsewhere.

Custom evidence can be attached while a step is active:

```js
await qkta.attachEvidence(
  { requestId: 'abc-123', status: 200 },
  { name: 'checkout-api', mimeType: 'application/json' }
);
```

`FileEvidenceStore` stores screenshots under `qreport-results/media-bucket/screenshots` and other attachments under `qreport-results/media-bucket/evidence`. A custom evidence store can be injected by implementing `save(options)` and returning artifact metadata.

### Legacy QReport transition

By default `createWdioCucumberAdapter()` creates a `LegacyQReportSink` backed by `ExecutionDataManager`. It always writes the canonical execution envelope: `{ "<run-id>": { "execution_summary": {}, "<feature>": {} } }`. If neither `runId` nor `RUN_ID` is supplied, the adapter generates a `run-<uuid>` ID. This keeps `current.json`, screenshot keys and the existing QReport HTML input convention working while QK frameworks migrate.

`normalizeLegacyReport()` accepts that canonical envelope, a bare execution object, and the historical QReport project-root object. Other shapes are skipped with `model.diagnostics`; structural nodes are never promoted into `UNKNOWN` tests.

Disable the compatibility sink when supplying a custom runtime:

```js
const qkta = createWdioCucumberAdapter({
  runtime: myRuntime,
  capture: 'never'
});
```

Legacy dynamic object paths are a compatibility output only. New adapters should target the event contract rather than emit legacy JSON themselves.

### Redacting scenario-outline values and errors

Scenario Outline substitutions, step text, errors and custom evidence names are reportable data. Configure redaction in the adapter so sensitive values are removed **before** any runtime sink, legacy JSON or evidence metadata sees them:

```js
const qkta = createWdioCucumberAdapter({
  redaction: {
    values: [process.env.TEST_PASSWORD, process.env.TEST_API_TOKEN].filter(Boolean),
    patterns: [/session=[^\s&]+/gi],
    strict: true
  }
});
```

`values` and `patterns` are replaced with `[REDACTED]`; common `password=…`, token and Bearer forms are also redacted by default. `strict: true` stops the lifecycle before it emits an event containing a configured value or pattern. The adapter uses opaque, deterministic scenario and step identities, separate from their display labels, so redaction does not make analytics grouping depend on a secret.

## Adapter design rules

1. Keep runner dependencies and lifecycle types inside the adapter.
2. Emit milliseconds for durations and ISO timestamps through the runtime.
3. Use stable runner IDs when available; generate deterministic fallback identities only when necessary.
4. Preserve the original error text/stack rather than classifying failures in the adapter.
5. Store large evidence as references, not inline blobs in result JSON.
6. Do not add installation side effects or invoke secondary package managers.
7. Add pass, fail, error and evidence integration tests for every official adapter.
