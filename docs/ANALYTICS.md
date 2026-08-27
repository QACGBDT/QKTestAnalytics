# Cross-run analytics

QKTestAnalytics analytics are deterministic, local-first and designed to be auditable in CI. The analytics contract is versioned independently as `analyticsVersion: "1.0"` and is available programmatically from `@qacg/qk-test-analytics/analytics` or through `qkta analyze` / `qkta compare`.

## Stable test identity

A test can provide `historyId` or `stableId`; an explicit value is used unchanged.

Otherwise QKTestAnalytics derives a stable identity from the canonical JSON tuple:

- project
- suite
- test name
- browser
- parameters, recursively sorted by key

Execution id, cycle, source, branch and commit are deliberately excluded so the identity survives repeated executions. Browser is included so a Chrome and Firefox variant are not misclassified as retries of one another. The derived id is `qkta:` plus the first 24 hexadecimal characters of SHA-256 over that canonical tuple. `identityKey` is exported alongside the hash so the derivation remains inspectable.

## Retries and flakiness

Within one execution, repeated occurrences of the same stable identity are attempts. `retryCount = attempts - 1`.

A run is **retry-flaky** when its final attempt is `PASSED` and an earlier attempt in the same execution is `FAILED`, `BROKEN` or `ERROR`.

A test is **history-flaky** when final outcomes across executions contain at least one `PASSED` and at least one `FAILED`, `BROKEN` or `ERROR`. `SKIPPED` and `PENDING` do not by themselves make a test flaky.

The final classification is:

- `flaky`: retry-flaky or history-flaky
- `failing`: failure outcomes exist and no pass outcome exists
- `stable`: pass outcomes exist and no failure outcome exists
- `skipped`: only skipped/pending-style outcomes are observed
- `unknown`: none of the above

`flakyRate = flakyTests / uniqueTests * 100`.

## Duration trend and regression

Only successful final attempts with a positive duration are used for historical duration statistics.

`medianMs` is the ordinary median of successful samples. `p95Ms` uses the nearest-rank percentile (`ceil(0.95 * N)`). Slow-test ranking is descending p95, then median, and defaults to the top 10 tests.

A duration regression is evaluated only when the **latest observation is passing**. The baseline is the median of up to the previous `baselineWindow` successful samples, default 5. At least `minBaselineSamples`, default 2, are required.

Given latest duration `C` and baseline median `B`:

```text
deltaMs = C - B
percentDelta = ((C - B) / B) * 100
```

The test is regressed only when both conditions are true:

```text
deltaMs >= durationRegressionMinMs          # default 100 ms
percentDelta >= durationRegressionPercent   # default 20%
```

Requiring both an absolute and relative threshold prevents tiny tests from becoming noisy regressions.

## Failure fingerprints

Failure grouping starts from the first non-stack message lines. Normalization lowercases text and replaces volatile values before SHA-256 hashing:

- ISO timestamps -> `<timestamp>`
- UUIDs -> `<uuid>`
- hexadecimal addresses/long hashes -> `<hex>`
- stack line/column numbers -> `<line>:<col>`
- decimal numbers with 5 or more digits -> `<number>`

Short numbers are intentionally preserved, so semantically different messages such as HTTP 404 and HTTP 500 remain different fingerprints. The exported failure group contains both the hash and `normalized` text for auditability.

## Compare executions, branches or commits

`compareReportExecutions(report, base, head)` accepts selectors matching an execution id, cycle, branch, commit or project. When multiple executions match (for example a branch), the latest execution is selected. Structured selectors such as `{ commit: "abc123" }` are also supported.

Comparison reports include:

- added and removed tests
- pass -> failure regressions
- failure -> pass improvements
- other status changes
- pairwise duration changes/regressions for tests passing in both executions
- new and resolved failure fingerprints
- summary deltas for tests, pass/fail counts, pass rate and duration

## CLI JSON export

```bash
# Historical analytics from current.json + rep_*.json
npx qkta analyze \
  --input qreport-results/media-bucket/reports \
  --output qreport-results/analytics.json

# Compare by cycle, run id, branch or commit
npx qkta compare \
  --input qreport-results/media-bucket/reports \
  --base main \
  --head feature/checkout \
  --output qreport-results/comparison.json
```

Thresholds are configurable on both commands:

```bash
--baseline-window 5
--min-baseline-samples 2
--regression-percent 20
--regression-min-ms 100
--slow-limit 10
```

These commands only produce JSON; they do not impose quality-gate exit codes. Policy enforcement belongs to `qkta gate` so analytics remain descriptive and reusable.
