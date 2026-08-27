# Competitive analysis

Research baseline: August 2026. The goal is not to clone competitors; it is to identify the minimum capabilities expected of a credible modern test reporter and where QKTestAnalytics can have a clear product position.

## Positioning

**QKTestAnalytics = open, local-first test analytics with a portable report and a stable cross-framework data contract.** It should work with no server, then scale outward through adapters/exporters.

## Allure Report 3

Allure is the closest open-source reporting benchmark. Current Allure 3 documentation emphasizes a plugin architecture, retries, environments, history/trend data, attachments, categories and quality gates, and supports generating a single-file report. Its ecosystem breadth is a major advantage.

Implications for QKTestAnalytics:
- Treat retries, labels/parameters, attachments and environment metadata as schema-level concepts rather than UI hacks.
- Add quality-gate evaluation usable in CI without rendering HTML.
- Make history portable and explicit, not inferred only from filenames.
- Keep adapter authoring straightforward; ecosystem coverage matters more than a highly bespoke core.

## ReportPortal

ReportPortal represents the server-centric end of the market: centralized launches, dashboards, long-lived history and automated failure/defect analysis. Its strength is team-scale triage rather than a static artifact.

Implications:
- Do not force a server into the base product.
- Design failure fingerprints, launch IDs and history storage so an optional QK service can later provide centralized analytics.
- A future exporter/API can provide team dashboards without breaking local workflows.

## Playwright HTML reporter / trace

Playwright sets a strong runner-native baseline: easy HTML output plus rich trace/evidence debugging. QKTestAnalytics cannot win merely by producing nicer pass/fail cards.

Implications:
- Preserve links to native traces and artifacts.
- Aggregate across frameworks/projects/runs, where runner-native reporters are naturally narrower.
- Support importing Playwright results rather than replacing Playwright's diagnostic tooling.

## Mochawesome

Mochawesome demonstrates the value of a lightweight HTML+JSON workflow and simple CI artifact generation. Its smaller scope is useful evidence that installation friction matters.

Implications:
- Keep zero-server setup excellent.
- Keep JSON export/import stable and human-inspectable.
- Avoid heavy mandatory runtime dependencies.

## Capability matrix and priority

| Capability | QK legacy | Allure-class expectation | QKTestAnalytics priority |
|---|---:|---:|---:|
| Static HTML | Yes | Yes | P0 |
| Historical runs | Yes | Yes | P0 |
| Search/filter | Yes | Yes | P0 |
| Screenshots/errors | Yes | Yes | P0 |
| Video | Yes, custom | Artifact/adapter | P1 |
| Framework-neutral schema | No | Ecosystem adapters | P0 |
| Retries/flakiness | Partial inference | Yes | P0 |
| Parameters/labels | Arbitrary step data | Yes | P0 |
| Quality gates | No | Yes | P1 |
| Plugin/adapter API | No | Yes | P0 |
| Central server | No | Separate products | P2/optional |
| Automated defect triage | No | ReportPortal strength | P2 |
| Single-file/no server | Yes | Yes | Core differentiator |

## Differentiators to pursue

1. **One portable analytics format across QK and external frameworks.**
2. **Local-first with zero infrastructure**, but designed to upload/export later.
3. **First-class cross-run analytics**: flakiness, duration regression, failure fingerprints and change comparison.
4. **Excellent CI ergonomics**: one CLI, deterministic artifacts, machine-readable gate output.
5. **Open extension points** for adapters, evidence storage and exporters.
6. **QK ecosystem integration** without making QKForce a runtime requirement.

## Anti-goals

- Reimplementing a full test management platform inside the npm package.
- Depending on a database for basic reporting.
- Replacing runner-native trace viewers.
- Baking one cloud/object-store provider into core.
- Claiming AI/ML triage before enough structured historical data exists to make it useful.
