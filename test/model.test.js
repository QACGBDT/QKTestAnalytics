import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLegacyReport, summarizeExecutions } from '../src/index.js';

const legacyRun = overrides => ({
  cycleA: {
    run1: {
      execution_summary: {
        project_name: 'demo',
        global_start_time: '2026-01-01T00:00:00.000Z',
        global_end_time: '2026-01-01T00:00:02.000Z',
        global_time_seconds: 2,
        ...overrides?.execution_summary
      },
      Login: {
        works: {
          test_summary: {
            status: 'PASSED',
            duration_seconds: 1.5,
            browser: 'chrome',
            ...overrides?.test_summary
          },
          Given: { status: 'PASSED', evidence: 'screen.png' },
          ...overrides?.steps
        }
      }
    }
  }
});

test('normalizes legacy cycles, executions, suites, tests and steps', () => {
  const model = normalizeLegacyReport(legacyRun());
  const execution = model.executions[0];
  const result = execution.tests[0];

  assert.equal(model.schemaVersion, '1.0');
  assert.equal(execution.project, 'demo');
  assert.equal(execution.durationMs, 2000);
  assert.equal(result.durationMs, 1500);
  assert.equal(result.browser, 'chrome');
  assert.deepEqual(result.steps[0], { name: 'Given', status: 'PASSED', evidence: 'screen.png' });
});

test('records an explicit source and stable legacy test identity', () => {
  const model = normalizeLegacyReport(legacyRun(), 'wdio-cucumber');
  assert.equal(model.executions[0].source, 'wdio-cucumber');
  assert.equal(model.executions[0].tests[0].id, 'run1:Login:works');
});

test('normalizes status whitespace and casing', () => {
  const model = normalizeLegacyReport(legacyRun({ test_summary: { status: ' passed ' } }));
  assert.equal(model.executions[0].tests[0].status, 'PASSED');
});

test('uses UNKNOWN and zero duration for missing or invalid legacy values', () => {
  const model = normalizeLegacyReport(legacyRun({
    execution_summary: { global_time_seconds: -4 },
    test_summary: { status: '   ', duration_seconds: 'not-a-number' }
  }));
  const result = model.executions[0].tests[0];

  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.durationMs, 0);
  assert.equal(model.executions[0].durationMs, 0);
});

test('does not manufacture executions from malformed container values', () => {
  const model = normalizeLegacyReport({ broken: 'not-an-object', alsoBroken: [] });
  assert.deepEqual(model.executions, []);
});

test('recognizes bare and historical project-root executions without turning structure into tests', () => {
  const bare = legacyRun().cycleA.run1;
  const fromCycle = normalizeLegacyReport({ 'Current cycle': bare });
  const fromProjectRoot = normalizeLegacyReport(bare);

  for (const model of [fromCycle, fromProjectRoot]) {
    assert.equal(model.executions.length, 1);
    assert.equal(model.executions[0].tests.length, 1);
    assert.equal(model.executions[0].tests[0].status, 'PASSED');
    assert.equal(model.executions[0].tests[0].name, 'works');
    assert.equal(model.diagnostics.length, 0);
  }
});

test('skips unsupported structural nodes with a diagnostic instead of fabricating UNKNOWN tests', () => {
  const model = normalizeLegacyReport({
    cycle: {
      run: {
        execution_summary: { project_name: 'demo' },
        Login: { test_summary: { status: 'PASSED' }, Given: { status: 'PASSED' } },
        malformed: { nested: { status: 'UNKNOWN' } }
      }
    }
  });

  assert.equal(model.executions.length, 1);
  assert.equal(model.executions[0].tests.length, 0);
  assert.equal(model.diagnostics[0].code, 'UNSUPPORTED_LEGACY_TEST_NODE');
});

test('preserves primitive step values safely', () => {
  const model = normalizeLegacyReport(legacyRun({ steps: { Then: 'done' } }));
  const primitive = model.executions[0].tests[0].steps.find(step => step.name === 'Then');
  assert.deepEqual(primitive, { name: 'Then', value: 'done' });
});

test('summarizes all outcome buckets and ignores invalid durations', () => {
  const result = summarizeExecutions([
    {
      tests: [
        { status: 'PASSED', durationMs: 10 },
        { status: 'FAILED', durationMs: 20 },
        { status: 'SKIPPED', durationMs: 5 },
        { status: 'PENDING', durationMs: Number.NaN },
        { status: 'UNKNOWN', durationMs: -10 }
      ]
    }
  ]);

  assert.deepEqual(result, {
    executions: 1,
    tests: 5,
    passed: 1,
    failed: 1,
    skipped: 2,
    other: 1,
    passRate: 20,
    durationMs: 35
  });
});

test('returns an empty deterministic summary for no executions', () => {
  assert.deepEqual(summarizeExecutions(), {
    executions: 0,
    tests: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    other: 0,
    passRate: 0,
    durationMs: 0
  });
});
