import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildAnalytics,
  compareReportExecutions,
  createTestIdentity,
  detectDurationRegression,
  fingerprintFailure,
  normalizeFailure,
  selectExecution,
  writeAnalyticsJson,
  writeComparisonJson
} from '../src/analytics/index.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/historical-report.json', import.meta.url), 'utf8'));
const byName = (analytics, name) => analytics.tests.find(item => item.name === name);

test('stable identity ignores execution ids and supports explicit identities and parameters', () => {
  const executionA = { id: 'one', project: 'shop' };
  const executionB = { id: 'two', project: 'shop' };
  const testA = { id: 'a', suite: 'Checkout', name: 'pay', parameters: { region: 'mx', user: 2 } };
  const testB = { id: 'b', suite: 'Checkout', name: 'pay', parameters: { user: 2, region: 'mx' } };
  assert.equal(createTestIdentity(testA, executionA).id, createTestIdentity(testB, executionB).id);
  assert.notEqual(
    createTestIdentity(testA, executionA).id,
    createTestIdentity({ ...testB, parameters: { user: 3, region: 'mx' } }, executionB).id
  );
  assert.deepEqual(createTestIdentity({ ...testA, historyId: 'customer-id' }, executionA), {
    id: 'customer-id', key: 'explicit:customer-id', strategy: 'explicit'
  });
});

test('failure fingerprints remove volatile values while preserving meaningful short codes', () => {
  const first = 'TimeoutError: request 123456 timed out at 2026-08-20T10:00:00Z id 7b57efc0-3e8c-4bd9-bef3-a74c0df14090';
  const second = 'TimeoutError: request 999999 timed out at 2026-08-21T11:22:33Z id 5544ef73-c9c4-4de2-8f6f-30c86de9877a';
  assert.equal(fingerprintFailure(first).fingerprint, fingerprintFailure(second).fingerprint);
  assert.match(normalizeFailure(first), /<number>/);
  assert.match(normalizeFailure(first), /<timestamp>/);
  assert.notEqual(
    fingerprintFailure('AssertionError: expected 200 but got 500').fingerprint,
    fingerprintFailure('AssertionError: expected 200 but got 404').fingerprint
  );
  assert.equal(fingerprintFailure(null), null);
});

test('buildAnalytics classifies retries and historical flakiness deterministically', () => {
  const analytics = buildAnalytics(fixture);
  assert.equal(analytics.generatedAt, fixture.generatedAt);
  assert.equal(analytics.summary.executions, 4);
  assert.equal(analytics.summary.uniqueTests, 4);
  assert.equal(analytics.summary.attempts, 14);
  assert.equal(analytics.summary.retries, 1);
  assert.equal(analytics.summary.flakyTests, 2);
  assert.equal(analytics.summary.flakyRate, 50);

  const checkout = byName(analytics, 'checkout payment');
  assert.equal(checkout.classification, 'flaky');
  assert.equal(checkout.retryFlaky, true);
  assert.equal(checkout.historyFlaky, false);
  assert.equal(checkout.retries, 1);
  assert.equal(checkout.retryRuns, 1);

  const search = byName(analytics, 'search catalog');
  assert.equal(search.classification, 'flaky');
  assert.equal(search.retryFlaky, false);
  assert.equal(search.historyFlaky, true);

  const health = byName(analytics, 'backend health');
  assert.equal(health.classification, 'failing');
});

test('duration analytics use historical median for regression and p95 for slow ranking', () => {
  const analytics = buildAnalytics(fixture);
  const checkout = byName(analytics, 'checkout payment');
  assert.equal(checkout.duration.medianMs, 1250);
  assert.equal(checkout.duration.p95Ms, 1800);
  assert.deepEqual(checkout.duration.regression, {
    regressed: true,
    baselineSampleSize: 3,
    baselineMedianMs: 1200,
    currentDurationMs: 1800,
    deltaMs: 600,
    percentDelta: 50
  });
  assert.equal(analytics.summary.durationRegressions, 1);
  assert.equal(analytics.slowTests[0].name, 'export inventory');
  assert.equal(analytics.slowTests[0].p95Ms, 2500);

  assert.equal(detectDurationRegression([{ status: 'PASSED', durationMs: 1000 }]).regressed, false);
});

test('failure grouping combines normalized recurring failures across runs', () => {
  const analytics = buildAnalytics(fixture);
  const timeout = analytics.failureGroups.find(group => group.normalized.startsWith('timeouterror'));
  assert.equal(timeout.occurrences, 4);
  assert.equal(timeout.executionCount, 4);
  assert.equal(timeout.testCount, 1);
  assert.equal(analytics.summary.failureGroups, 3);
});

test('compare selects latest branch execution and reports status, duration, added tests and fingerprints', () => {
  const comparison = compareReportExecutions(fixture, 'main', 'feature/analytics');
  assert.equal(comparison.base.commit, 'c3');
  assert.equal(comparison.head.commit, 'c4');
  assert.equal(comparison.statusImprovements[0].name, 'search catalog');
  assert.equal(comparison.added[0].name, 'export inventory');
  assert.equal(comparison.removed.length, 0);
  assert.equal(comparison.durationRegressions[0].name, 'checkout payment');
  assert.equal(comparison.durationRegressions[0].percentDelta, 38.46);
  assert.equal(comparison.newFailureFingerprints.length, 0);
  assert.equal(comparison.resolvedFailureFingerprints.length, 1);

  const byCommit = compareReportExecutions(fixture, 'c3', 'c4');
  assert.equal(byCommit.base.id, 'run-3');
  assert.equal(byCommit.head.id, 'run-4');
});

test('execution selectors support structured selectors and missing refs fail clearly', () => {
  assert.equal(selectExecution(fixture, { commit: 'c2' }).id, 'run-2');
  assert.equal(selectExecution(fixture, fixture.executions[0]).id, 'run-1');
  assert.equal(selectExecution(fixture, 'missing'), null);
  assert.throws(() => compareReportExecutions(fixture, 'missing', 'c4'), /could not find base execution/);
});

test('analytics and comparison exports write deterministic machine-readable JSON', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qkta-analytics-'));
  const analyticsPath = path.join(root, 'analytics.json');
  const comparisonPath = path.join(root, 'comparison.json');
  const analyticsResult = writeAnalyticsJson(fixture, { output: analyticsPath });
  const comparisonResult = writeComparisonJson(fixture, 'c3', 'c4', { output: comparisonPath });
  assert.equal(analyticsResult.output, analyticsPath);
  assert.equal(comparisonResult.output, comparisonPath);
  assert.equal(JSON.parse(fs.readFileSync(analyticsPath, 'utf8')).summary.flakyTests, 2);
  assert.equal(JSON.parse(fs.readFileSync(comparisonPath, 'utf8')).head.commit, 'c4');
});
