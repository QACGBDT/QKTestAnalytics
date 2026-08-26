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

- Stable test identity across runs.
- Retry model and flaky-test detection.
- Duration regression and slow-test views.
- Failure fingerprinting/grouping.
- Compare two runs/branches/commits.
- Export machine-readable analytics JSON.

## 0.4 — CI quality gates

- Thresholds for pass rate, failures, flaky rate and duration regression.
- Non-zero CLI exit codes and JSON gate output.
- GitHub Actions examples and PR summary generation.
- Artifact size/performance budgets.

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
