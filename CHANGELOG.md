# Changelog

All notable changes to QKTestAnalytics will be documented in this file.

The format follows Keep a Changelog principles and this project uses Semantic Versioning once stable public releases begin.

## [Unreleased]

### Added

- Dependency-free repository lint and source-hygiene checks.
- Native Node coverage thresholds: 85% lines, 85% functions, and 75% branches.
- Expanded unit and integration coverage for the canonical model, execution data manager, HTML reporting, and CLI lifecycle.
- CI compatibility testing across Node 20, 22, and 24.
- `.editorconfig` for consistent public contributions.

### Changed

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
