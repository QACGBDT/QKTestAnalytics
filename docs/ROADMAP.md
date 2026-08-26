# Roadmap

## 0.1 — Consolidated foundation

- One public npm package and CLI.
- Legacy QReport result importer.
- Canonical schema v1 draft.
- Self-contained HTML report.
- Search/status/cycle filters.
- Unit tests, CI, npm release workflow and public-project governance docs.

## 0.2 — Adapter SDK

- Event-based reporter API.
- Official WebdriverIO + Cucumber adapter preserving current QK behavior.
- Playwright adapter/importer.
- Cucumber JSON/messages importer.
- JUnit XML importer.
- Evidence abstraction for screenshots, videos and trace links.
- Localization layer (English/Spanish).

## 0.3 — Analytics

Implemented core in issue #3:

- Stable test identity across runs and browser/data variants.
- Retry model plus retry-flaky and history-flaky classification.
- Duration trends, median baseline regression detection and p95 slow-test ranking.
- Normalized failure fingerprinting/grouping.
- Compare two executions by run/cycle/branch/commit/project selector.
- Machine-readable analytics and comparison JSON exports.

## 0.4 — CI quality gates

Implemented core in issue #4:

- Configurable thresholds for pass rate, failures, flaky rate and duration regressions.
- Deterministic CLI exit codes and machine-readable JSON gate output.
- Human-readable console summary plus GitHub-flavored Markdown PR/check summary.
- Target-aware baseline selection with future-run isolation.
- GitHub Actions example that preserves report/gate artifacts before enforcing the decision.

Follow-up hardening can add artifact-size and execution-performance budgets after representative large-suite benchmarks are available.

## 0.5 — Extension ecosystem

- Public adapter/plugin contracts.
- Optional evidence storage exporters (filesystem, object storage).
- Optional video/frame tooling with no install-time side effects.
- Theme/branding hooks without forking the renderer.

## 1.0 — Stable reporter

- Freeze canonical schema v1 and public APIs.
- Compatibility guarantees and formal deprecation policy.
- Supported adapter matrix.
- Performance testing against large suites/history datasets.
- Accessibility and browser compatibility pass.
- Signed/provenance npm releases and documented release process.

## Future / QK platform integration

A separate optional service/exporter may upload canonical reports into QKForce for organization-level retention, permissions, dashboards and AI-assisted triage. The npm reporter must remain fully useful without that service.
