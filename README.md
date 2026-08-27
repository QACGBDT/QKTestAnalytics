# QKTestAnalytics

Open, framework-agnostic test analytics and reporting from **Quality & Knowledge (QK)**. QKTestAnalytics consolidates the former `quality-report-data` and `quality-dashboard` projects into one public npm package and one stable reporting contract.

> Status: **0.4.1 public release**. The package includes the framework-neutral core, Adapter SDK, cross-run analytics and CI quality gates while preserving legacy QReport compatibility. QKForce CWQ pins this public package for its fixed WDIO/Cucumber profile.

## Why QKTestAnalytics

- **Zero-server by default**: generate a portable, self-contained HTML report locally or in CI.
- **Framework-agnostic core**: runner sessions and globals stay in adapters, never in core.
- **Historical analytics**: stable test identity, retries/flakiness, duration regression, slow-test p95 and failure fingerprinting across runs.
- **Machine-enforceable quality**: pass rate, failures, flaky rate and duration regressions can fail CI with auditable JSON output.
- **Evidence-friendly**: steps, errors, browser metadata, screenshots/video references can be represented without forcing a storage backend.
- **Public-package safe**: no install-time Python, pip, OpenCV, database or service requirement.
- **QK-native, vendor-neutral**: designed as the default reporter across QK frameworks while remaining usable independently.

## Install

```bash
npm install -D @qacg/qk-test-analytics
```

## CLI

```bash
# Build the report from the legacy/default result directory
npx qkta build

# Generate machine-readable cross-run analytics
npx qkta analyze --output qreport-results/analytics.json

# Compare two cycles/runs/branches/commits
npx qkta compare --base main --head feature/checkout --output qreport-results/comparison.json

# Enforce CI quality thresholds; returns 2 for quality violations
npx qkta gate \
  --min-pass-rate 95 \
  --max-failures 0 \
  --max-flaky-rate 5 \
  --max-duration-regressions 0 \
  --output qreport-results/gate.json \
  --summary qreport-results/gate-summary.md

# Archive current.json
npx qkta clean

# Run a command in a new test cycle
npx qkta cycle --new -- npm test
```

Transition aliases `qreport-build` and `qreport-cycle` remain available in 0.x. See [Cross-run analytics](docs/ANALYTICS.md) for formulas and [CI quality gates](docs/QUALITY-GATES.md) for enforcement semantics and exit codes.

## CI quality gates

`qkta gate` evaluates the latest execution by default or a specific `--target` execution id/cycle/branch/commit/project. It truncates history at that target before calculating flakiness and duration regression, so future runs cannot affect an older gate decision.

The default thresholds are intentionally strict: **100% pass rate, 0 failures, 0% flaky rate and 0 duration regressions**. Equality at a configured boundary passes. Exit codes are stable: `0` pass, `1` usage/data/configuration error, `2` quality violation.

A complete GitHub Actions example is provided at [`examples/github-actions/qkta-quality-gate.yml`](examples/github-actions/qkta-quality-gate.yml). It publishes the Markdown gate result to the GitHub job summary and uploads the HTML report plus machine-readable gate artifacts before enforcing the final exit code.

## WebdriverIO + Cucumber

QKTestAnalytics includes its first official adapter without adding a mandatory WebdriverIO dependency to the package:

```js
import { createWdioCucumberAdapter } from '@qacg/qk-test-analytics/adapters/wdio-cucumber';

const qkta = createWdioCucumberAdapter({
  capture: 'on-failure'
});

export const config = {
  framework: 'cucumber',
  // ...your existing WDIO configuration
  ...qkta.hooks
};
```

The adapter consumes the browser/session instance passed by WebdriverIO's `before` hook rather than a global `browser`. Pass/fail lifecycle, duration, errors, tags and screenshots are translated through the framework-neutral Adapter SDK. Existing QReport JSON remains the default compatibility output, wrapped under an explicit generated run ID when `RUN_ID` is not set. Scenario/step labels, errors and custom evidence names can be redacted before they reach events, JSON or HTML; see [Adapter SDK and integrations](docs/ADAPTERS.md#redacting-scenario-outline-values-and-errors).

See [Adapter SDK and integrations](docs/ADAPTERS.md) for custom evidence, capture policies and building another adapter.

## Programmatic API

```js
import {
  ExecutionDataManager,
  buildAnalytics,
  buildQualityGate,
  buildReport
} from '@qacg/qk-test-analytics';

const report = new ExecutionDataManager();
report.recordStart({ projectName: 'checkout', framework: 'webdriverio' });
report.saveData('Checkout.pay.test_summary.status', 'PASSED');
report.recordEnd();

buildReport();

const analytics = buildAnalytics({
  schemaVersion: '1.0',
  generatedAt: new Date().toISOString(),
  executions: []
});

const gate = buildQualityGate(normalizedReport, {
  minPassRate: 95,
  maxFailures: 0,
  maxFlakyRate: 5,
  maxDurationRegressions: 0
});
```

Adapter primitives are available from `@qacg/qk-test-analytics/adapters`; analytics and quality-gate primitives are also available from `@qacg/qk-test-analytics/analytics`.

## Development quality gates

All development branches start from and target `develop`. The package deliberately keeps its quality tooling lightweight and reproducible with Node itself.

```bash
npm ci
npm run check
```

On Node 22+, the release-equivalent gate also enforces coverage:

```bash
npm run quality
```

The current minimums are **85% line coverage**, **85% function coverage**, and **75% branch coverage**. CI separately verifies runtime compatibility on Node 20, 22, and 24. Publishing to npm runs the same full quality gate before `npm publish`.

## Releasing

The public package is `@qacg/qk-test-analytics`. Release tags must match `v<package.version>` and point to a commit contained in `main`; publishing then runs from the GitHub Release event. See [Releasing to npm](docs/RELEASING.md) for the first-publish bootstrap, Trusted Publishing/OIDC setup and maintainer verification.

## Architecture

QKTestAnalytics separates **collection**, **normalization**, **analytics** and **presentation**. Framework adapters emit a versioned event contract consumed by storage/analytics sinks. The analytics layer consumes stable normalized executions, and the HTML renderer consumes the normalized model, preventing either from becoming tied to a runner.

See [Architecture](docs/ARCHITECTURE.md), [Adapter SDK](docs/ADAPTERS.md), [Cross-run analytics](docs/ANALYTICS.md), [CI quality gates](docs/QUALITY-GATES.md), [Competitive analysis](docs/COMPETITIVE-ANALYSIS.md), [Migration](docs/MIGRATION.md), [Releasing](docs/RELEASING.md), and [Roadmap](docs/ROADMAP.md).

## Current compatibility

The importer understands the canonical run envelope produced by the adapter, the bare project-root hierarchy produced by `@qacgbdt/quality-report-data` 1.1.x, and the current/history convention consumed by `@qacgbdt/quality-dashboard` 1.1.x. Existing `qreport-results/media-bucket/reports/{current,rep_*}.json` directories can therefore be rendered, analyzed or gated without changing historical data. Unsupported legacy layouts produce diagnostics rather than fabricated test results.

The WDIO/Cucumber adapter writes that same compatibility structure by default through `LegacyQReportSink`, allowing QK frameworks to migrate their lifecycle code without losing existing report history or dashboard compatibility.

## Security and public contribution

Please read [SECURITY.md](SECURITY.md) before reporting a vulnerability and [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. By contributing, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
