# Changelog

All notable changes to QKTestAnalytics will be documented here. The project follows Semantic Versioning once the public API reaches 1.0; during 0.x, breaking changes are called out explicitly.

## [0.1.0] - Unreleased

### Added
- Consolidated foundation replacing the separate quality-report-data and quality-dashboard packages.
- Public `qkta` CLI with build, clean and cycle commands.
- Temporary `qreport-build` and `qreport-cycle` aliases.
- Versioned canonical result model and legacy QReport importer.
- Self-contained HTML report with core analytics and filtering.
- Programmatic data manager and report builder APIs.
- Node test suite, CI matrix and npm release workflow with provenance.
- Architecture, competitive analysis, migration, roadmap, contribution and security documentation.

### Changed
- Package targets public npm rather than GitHub Packages.
- Core is framework-neutral rather than directly calling WebdriverIO globals.

### Removed
- Automatic Python/OpenCV installation during npm postinstall.
