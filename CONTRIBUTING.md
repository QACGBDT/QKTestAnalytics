# Contributing to QKTestAnalytics

Thank you for helping improve QKTestAnalytics.

## Development flow

`develop` is the integration branch. Create feature, fix, test, or documentation branches from `develop` and target pull requests back to `develop`. `main` is reserved for release-ready changes.

## Local quality gates

QKTestAnalytics intentionally keeps its developer tooling dependency-light. The repository uses Node's test runner and native coverage support plus a repository lint/hygiene gate.

Before opening a pull request, run:

```bash
npm ci
npm run check
```

On Node 22 or newer, run the complete release-equivalent gate:

```bash
npm run quality
```

`npm run quality` requires at least 85% line coverage, 85% function coverage, and 75% branch coverage. It also validates JavaScript syntax, repository text hygiene, architectural guardrails, and the npm package payload.

## Expectations

- Add or update tests for behavioral changes.
- Keep core code independent from test-runner globals; runner behavior belongs in adapters.
- Do not add install-time side effects such as `postinstall` downloads.
- Preserve public API compatibility unless a breaking change is explicitly planned and documented.
- Keep public documentation and `CHANGELOG.md` aligned with externally visible changes.

CI verifies Node 20, 22, and 24 compatibility and runs the complete quality gate on Node 22.
