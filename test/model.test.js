import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLegacyReport, summarizeExecutions } from '../src/index.js';

test('normalizes legacy cycles, executions, suites and tests', () => {
  const model = normalizeLegacyReport({ cycleA: { run1: { execution_summary: { project_name: 'demo', global_time_seconds: 2 }, Login: { works: { test_summary: { status: 'PASSED', duration_seconds: 1.5, browser: 'chrome' }, Given: { status: 'PASSED' } } } } } });
  assert.equal(model.schemaVersion, '1.0');
  assert.equal(model.executions[0].project, 'demo');
  assert.equal(model.executions[0].tests[0].durationMs, 1500);
  assert.equal(model.executions[0].tests[0].steps[0].name, 'Given');
});

test('summarizes test outcomes', () => {
  const result = summarizeExecutions([{ tests: [{ status: 'PASSED', durationMs: 10 }, { status: 'FAILED', durationMs: 20 }] }]);
  assert.deepEqual({ tests: result.tests, passed: result.passed, failed: result.failed, passRate: result.passRate }, { tests: 2, passed: 1, failed: 1, passRate: 50 });
});
