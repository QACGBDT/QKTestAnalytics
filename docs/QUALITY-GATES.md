# CI quality gates

QKTestAnalytics can turn normalized test history into a deterministic CI decision with `qkta gate` or the programmatic `buildQualityGate()` API.

## Quick start

```bash
npx qkta gate \
  --min-pass-rate 95 \
  --max-failures 0 \
  --max-flaky-rate 5 \
  --max-duration-regressions 0 \
  --output qreport-results/gate.json \
  --summary qreport-results/gate-summary.md
```

Without explicit gate thresholds, `qkta gate` is intentionally strict:

- minimum pass rate: `100%`
- maximum final failures: `0`
- maximum flaky rate: `0%`
- maximum duration regressions: `0`

Threshold equality passes. A pass rate exactly equal to the minimum is accepted, and a count/rate exactly equal to a maximum is accepted.

## Exit codes

`qkta gate` uses stable exit-code semantics:

| Code | Meaning |
| ---: | --- |
| `0` | Gate evaluated successfully and passed. |
| `1` | Usage, configuration, selector, or input-data error. |
| `2` | Gate evaluated successfully but one or more quality thresholds failed. |

This distinction lets CI systems separate an invalid pipeline from a valid quality rejection.

## Target and baseline selection

By default, the target is the latest execution after chronological ordering by `startedAt` with stable input order as fallback.

Use `--target REF` to select a specific execution. A string reference can match execution id, cycle, branch, commit, or project. When several executions match a branch or project, the latest matching execution is selected.

```bash
npx qkta gate --target 4f62a8c
npx qkta gate --target feature/checkout
npx qkta gate --target cycle-42
```

History is truncated at the selected target before flakiness and duration regression are evaluated. Executions after the target are never used to classify the target or build its duration baseline.

### Duration baseline

Duration regression reuses the auditable analytics model documented in [ANALYTICS.md](ANALYTICS.md):

1. Only prior successful observations for the same stable test identity are eligible.
2. At most the previous `--baseline-window` samples are used; default `5`.
3. At least `--min-baseline-samples` are required; default `2`.
4. The baseline is the median of those samples.
5. The current target observation must pass.
6. A regression requires both the relative and absolute thresholds: default `>=20%` and `>=100 ms`.

The gate then counts how many target tests are regressed and compares that count with `--max-duration-regressions`.

## Metric formulas

Retries within one execution are collapsed to the final attempt for pass/failure metrics. Retry history is still retained for flaky classification.

### Pass rate

```text
pass rate = target tests with final status PASSED / all unique target tests * 100
```

Skipped, pending, failed, broken, error, and unknown final outcomes remain in the denominator. This prevents skipped tests from silently inflating the pass rate.

The gate passes this rule when:

```text
pass rate >= --min-pass-rate
```

### Absolute failures

A final status of `FAILED`, `BROKEN`, or `ERROR` counts as a failure.

The gate passes this rule when:

```text
failures <= --max-failures
```

### Flaky rate

Only stable identities present in the target execution are counted. Their classification can use all history up to that target.

A target test is flaky when either:

- a retry in an execution failed and the final attempt passed, or
- final outcomes across executions include both pass and failure.

```text
flaky rate = flaky target tests / all unique target tests * 100
```

The gate passes this rule when:

```text
flaky rate <= --max-flaky-rate
```

### Duration regressions

The gate counts target tests whose duration regression detector returns `regressed: true` using the baseline rules above.

The gate passes this rule when:

```text
duration regressions <= --max-duration-regressions
```

## Machine-readable output

`qkta gate` writes JSON even when the quality result fails with exit code `2`:

```json
{
  "gateVersion": "1.0",
  "passed": false,
  "exitCode": 2,
  "target": {
    "id": "run-42",
    "branch": "feature/checkout",
    "commit": "4f62a8c"
  },
  "historyExecutions": 5,
  "thresholds": {
    "minPassRate": 95,
    "maxFailures": 0,
    "maxFlakyRate": 5,
    "maxDurationRegressions": 0
  },
  "metrics": {
    "tests": 120,
    "passed": 118,
    "failures": 1,
    "skipped": 1,
    "other": 0,
    "passRate": 98.33,
    "flakyTests": 3,
    "flakyRate": 2.5,
    "durationRegressions": 1
  },
  "violations": []
}
```

Each violation contains a stable rule id, metric name, actual value, operator, threshold, and human-readable message. CI integrations should prefer those structured fields over parsing console text.

## Human and PR/check summaries

The console always receives a concise text decision. `--summary FILE` additionally writes GitHub-flavored Markdown with a threshold table and any violations.

A complete GitHub Actions example is available at [`examples/github-actions/qkta-quality-gate.yml`](../examples/github-actions/qkta-quality-gate.yml). It deliberately captures the gate exit code, publishes the Markdown to `$GITHUB_STEP_SUMMARY`, uploads report/gate artifacts even on failure, and only then returns the gate exit code.

## Programmatic API

```js
import {
  GATE_EXIT_CODE,
  buildQualityGate,
  formatGateMarkdown
} from 'qk-test-analytics/analytics';

const gate = buildQualityGate(report, {
  selector: 'feature/checkout',
  minPassRate: 95,
  maxFailures: 0,
  maxFlakyRate: 5,
  maxDurationRegressions: 0
});

console.log(formatGateMarkdown(gate));
process.exitCode = gate.passed ? GATE_EXIT_CODE.PASS : GATE_EXIT_CODE.VIOLATION;
```
