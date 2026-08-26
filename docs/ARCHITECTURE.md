# Architecture

## Product boundary

QKTestAnalytics is a **reporting SDK + CLI + static report renderer**, not a test runner. It must accept results from QK frameworks and third-party runners without requiring them to adopt QK execution semantics.

## Layers

1. **Adapters / collectors** — runner-specific lifecycle hooks (WDIO, Playwright, Cypress, Cucumber, JUnit, Pytest). They produce events or result objects.
2. **Canonical model** — versioned, runner-neutral executions, suites/tests, steps, status, duration, labels, parameters, errors and evidence references.
3. **Storage** — local JSON first. Future storage providers must implement a narrow interface rather than leak S3/database concerns into the model.
4. **Analytics** — pass/fail, duration, history, retries/flakiness, slow tests, failure fingerprints and comparisons.
5. **Presentation** — static single-file HTML by default; later optional web/server exporters can consume the same model.

## Canonical schema v1

Top-level fields: `schemaVersion`, `generatedAt`, `executions[]`. An execution owns metadata and `tests[]`. A test owns runner-neutral identity, suite, status, duration, environment fields, error/evidence and steps.

The v1 model intentionally avoids the legacy dynamic object path (`execution -> suite -> test -> arbitrary step keys`) as the long-term API because object keys are poor stable IDs and make schema evolution/querying difficult. The legacy structure remains an input adapter.

## Decisions inherited from the source repositories

### Keep

- Local-first JSON persistence and cycle history.
- Portable HTML generation.
- Execution/suite/test/step drill-down.
- Browser/status/cycle filtering concepts.
- Screenshots, error traces and video evidence as first-class report concepts.
- Historical scenario analytics.

### Refactor

- `quality-dashboard/script.js` is a large global-state renderer; presentation becomes model-driven modules.
- WebdriverIO's global `browser` must live only in a WDIO adapter, never in core.
- S3-style object-key assumptions become generic evidence URIs/paths.
- Spanish-only labels become localization data; English should be the package default with Spanish bundled.
- Filesystem synchronous writes are acceptable in the compatibility layer but a streaming/event writer is planned.

### Remove from default install

The old dashboard performs `pip install` in `postinstall` and uses Python/OpenCV to generate video from frames. Public npm installation must not execute unrelated package-manager commands. Video assembly will be an explicit optional adapter/tool, with native runner video preferred when available.

## Package design target

The project starts as one package to keep adoption simple. Split packages (`core`, adapters, UI) should happen only when adapter dependency pressure justifies it. Public APIs must be exported through `package.json#exports`; consumers should not import internal paths.

## Compatibility policy

- `0.x`: rapid schema/API iteration, with migration notes on every breaking change.
- `1.0`: schema v1 frozen under semantic versioning.
- Legacy QReport aliases/importers are deprecated only after QK-owned frameworks migrate and at least one minor release announces removal.
