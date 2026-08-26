import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAnalytics,
  compareExecutions,
  createTestIdentity,
  detectDurationRegression,
  executionReference,
  fingerprintFailure,
  median,
  normalizeFailure,
  percentile,
  resolveAnalyticsOptions,
  selectExecution,
  writeJsonArtifact
} from '../src/analytics/index.js';

test('analytics math helpers are deterministic for empty, even and bounded percentile inputs', () => {
  assert.equal(median([]), 0);
  assert.equal(median([4, 2]), 3);
  assert.equal(percentile([], 95), 0);
  assert.equal(percentile([1, 2, 3, 4], 0), 1);
  assert.equal(percentile([1, 2, 3, 4], 100), 4);
  assert.deepEqual(resolveAnalyticsOptions({ baselineWindow: -1, slowLimit: 0 }), {
    baselineWindow: 5,
    minBaselineSamples: 2,
    durationRegressionPercent: 20,
    durationRegressionMinMs: 100,
    slowLimit: 10
  });
});

test('duration regression is not reported when latest result fails or baseline is unusable', () => {
  assert.equal(detectDurationRegression([
    { status: 'PASSED', durationMs: 1000 },
    { status: 'PASSED', durationMs: 1200 },
    { status: 'FAILED', durationMs: 3000 }
  ]).regressed, false);

  assert.deepEqual(detectDurationRegression([
    { status: 'PASSED', durationMs: 0 },
    { status: 'PASSED', durationMs: 0 },
    { status: 'PASSED', durationMs: 1000 }
  ], { minBaselineSamples: 1 }), {
    regressed: false,
    baselineSampleSize: 0,
    baselineMedianMs: 0,
    currentDurationMs: 1000,
    deltaMs: 0,
    percentDelta: 0
  });
});

test('stable identity separates browser variants and normalizes complex parameter shapes', () => {
  const execution = { project: 'shop' };
  const chrome = createTestIdentity({
    suite: 'Checkout', name: 'pay', browser: 'chrome', parameters: { flags: [true, 2] }
  }, execution);
  const firefox = createTestIdentity({
    suite: 'Checkout', name: 'pay', browser: 'firefox', parameters: { flags: [true, 2] }
  }, execution);
  assert.notEqual(chrome.id, firefox.id);
  assert.match(chrome.key, /"browser":"chrome"/);
});

test('failure normalization handles Error objects, stack frames, hex values and structured objects', () => {
  const error = new Error('boom id 0xdeadbeef1234');
  const normalized = normalizeFailure(error);
  assert.match(normalized, /boom/);
  assert.match(normalized, /<hex>/);
  assert.doesNotMatch(normalized, /at analytics-edge/);
  assert.ok(fingerprintFailure({ code: 'E_TEST', message: 'structured 123456' }));
  assert.equal(normalizeFailure(''), null);
});

test('execution references read nested metadata and selectors choose latest matching project', () => {
  const report = {
    executions: [
      { id: 'a', project: 'shop', startedAt: '2026-01-01T00:00:00Z', metadata: { git: { branch: 'main', commit: 'abc' } }, tests: [] },
      { id: 'b', project: 'shop', startedAt: '2026-01-02T00:00:00Z', metadata: { branch: 'main', sha: 'def' }, tests: [] }
    ]
  };
  assert.deepEqual(executionReference(report.executions[0]), {
    id: 'a', cycle: null, project: 'shop', branch: 'main', commit: 'abc', startedAt: '2026-01-01T00:00:00Z'
  });
  assert.equal(selectExecution(report, 'shop').id, 'b');
  assert.equal(selectExecution(report, { branch: 'missing' }), null);
});

test('buildAnalytics handles empty, skipped and unknown histories', () => {
  assert.deepEqual(buildAnalytics({ schemaVersion: '1.0', generatedAt: 'fixed', executions: [] }).summary, {
    executions: 0,
    uniqueTests: 0,
    attempts: 0,
    retries: 0,
    flakyTests: 0,
    flakyRate: 0,
    durationRegressions: 0,
    failureGroups: 0
  });
  const result = buildAnalytics({
    schemaVersion: '1.0', generatedAt: 'fixed', executions: [{
      id: 'r', project: 'p', tests: [
        { id: 's', suite: 'S', name: 'skip', status: 'SKIPPED', durationMs: 0 },
        { id: 'u', suite: 'S', name: 'unknown', status: 'UNKNOWN', durationMs: 0 }
      ]
    }]
  });
  assert.equal(result.tests.find(item => item.name === 'skip').classification, 'skipped');
  assert.equal(result.tests.find(item => item.name === 'unknown').classification, 'unknown');
});

test('execution comparison reports regressions, removals, status changes and new failure groups', () => {
  const base = {
    id: 'base', project: 'p', tests: [
      { id: 'a', suite: 'S', name: 'regress', status: 'PASSED', durationMs: 100 },
      { id: 'b', suite: 'S', name: 'remove', status: 'PASSED', durationMs: 100 },
      { id: 'c', suite: 'S', name: 'other', status: 'SKIPPED', durationMs: 0 }
    ]
  };
  const head = {
    id: 'head', project: 'p', tests: [
      { id: 'a2', suite: 'S', name: 'regress', status: 'FAILED', durationMs: 200, error: 'Boom 123456' },
      { id: 'c2', suite: 'S', name: 'other', status: 'PENDING', durationMs: 0 }
    ]
  };
  const result = compareExecutions(base, head);
  assert.equal(result.statusRegressions[0].name, 'regress');
  assert.equal(result.removed[0].name, 'remove');
  assert.equal(result.statusChanges[0].name, 'other');
  assert.equal(result.newFailureFingerprints.length, 1);
  assert.equal(result.durationChanges.length, 0);
  assert.throws(() => compareExecutions(null, head), /base and head executions are required/);
});

test('writeJsonArtifact validates output', () => {
  assert.throws(() => writeJsonArtifact({}, ''), /output path is required/);
});
