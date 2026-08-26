# Changelog

All notable changes to QKTestAnalytics will be documented in this file.

The format follows Keep a Changelog principles and this project uses Semantic Versioning once stable public releases begin.

## [Unreleased]

### Added

- `qkta gate` command with configurable pass-rate, failure, flaky-rate and duration-regression thresholds.
- Stable quality-gate exit codes: `0` pass, `1` usage/data/configuration error and `2` quality violation.
- Machine-readable gate JSON plus human console and GitHub-flavored Markdown summaries.
- Target-aware quality evaluation that truncates analytics history at the selected run/branch/commit/project.
- Public quality-gate API and TypeScript declarations through `qk-test-analytics/analytics`.
- GitHub Actions quality-gate example that publishes a job/check summary and uploads report/gate artifacts before enforcement.
- Auditable baseline, formula and threshold documentation in `docs/QUALITY-GATES.md`.
- Pass/fail/boundary/error tests for programmatic and CLI gate flows.
- Cross-run analytics contract with stable test identity and deterministic history aggregation.
- Retry model with retry-flaky and historical pass/fail classification.
- Duration median/p95 trends, configurable regression detection and slow-test ranking.
- Normalized failure fingerprints and recurring-failure grouping.
- Execution comparison by run id, cycle, branch, commit or project with status/duration/fingerprint deltas.
- `qkta analyze` and `qkta compare` machine-readable JSON export commands.
- Public analytics API at `qk-test-analytics/analytics` plus TypeScript declarations.
- Auditable analytics formulas and threshold semantics in `docs/ANALYTICS.md`.
- Deterministic historical fixtures covering retries, flakiness, duration regressions and recurring failures.
- Versioned reporter event contract and `ReporterRuntime` sink pipeline.
- Official dependency-free WebdriverIO + Cucumber hook adapter.
- `FileEvidenceStore` with legacy-compatible screenshot paths and general attachment storage.
- `LegacyQReportSink` that maps adapter events back to existing QReport JSON during migration.
- WDIO screenshot policies (`never`, `on-failure`, `always`) and custom evidence attachment API.
- Public adapter exports at `qk-test-analytics/adapters` and `qk-test-analytics/adapters/wdio-cucumber`.
- Adapter SDK documentation with a minimal custom-adapter example.
- Pass/fail/error/evidence integration tests for the WDIO/Cucumber adapter and legacy bridge.
- Dependency-free repository lint and source-hygiene checks.
- Native Node coverage thresholds: 85% lines, 85% functions, and 75% branches.
- Expanded unit and integration coverage for the canonical model, execution data manager, HTML reporting, and CLI lifecycle.
- npm consumer smoke testing that packs, installs, imports, and executes the CLI from the generated tarball.
- CI compatibility testing across Node 20, 22, and 24.
- `.editorconfig` for consistent public contributions.

### Changed

- Stable identity explicitly separates browser variants to avoid false retry/flakiness classification.
- Runner lifecycle behavior is now owned by adapters rather than core utilities.
- The WDIO adapter keeps the explicitly passed session instance instead of reading a global `browser`.
- `develop` is now the integration base for CI and contributor pull requests.
- npm publishing runs the same quality gate required before release.
- Execution timing and archive identifiers are injectable to support deterministic tests.
- Invalid legacy durations and status whitespace are normalized defensively.
- `clearData()` now resets in-memory execution/module timers as well as persisted data.

## [0.1.0] - 2026-08-26

### Added

- Initial QKTestAnalytics public foundation.
- Framework-neutral canonical result model and legacy QReport normalization.
- Local execution data manager and report history compatibility.
- Self-contained HTML report builder.
- `qkta` CLI plus `qreport-build` and `qreport-cycle` transition aliases.
- Node 20/22/24 CI and npm provenance publishing workflow.
- Architecture, migration, competitive analysis, and product roadmap documentation.
