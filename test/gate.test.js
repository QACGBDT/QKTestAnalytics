import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_GATE_OPTIONS,
  GATE_EXIT_CODE,
  buildQualityGate,
  formatGateMarkdown,
  formatGateSummary,
  resolveGateOptions,
  writeGateJson,
  writeGateSummary
} from '../src/analytics/index.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/historical-report.json', import.meta.url), 'utf8'));

test('gate defaults are strict and threshold boundaries are inclusive', () => {
  assert.deepEqual(resolveGateOptions(), DEFAULT_GATE_OPTIONS);
  const gate = buildQualityGate(fixture, {
    selector: 'c4',
    minPassRate: 75,
    maxFailures: 1,
    maxFlakyRate: 50,
    maxDurationRegressions: 1
  });
  assert.equal(gate.passed, true);
  assert.equal(gate.exitCode, GATE_EXIT_CODE.PASS);
  assert.deepEqual(gate.violations, []);
});

test('strict gate reports pass-rate, failure, flaky-rate and duration-regression violations', () => {
  const gate = buildQualityGate(fixture, { selector: 'c4', generatedAt: '2026-08-26T20:00:00.000Z' });
  assert.equal(gate.passed, false);
  assert.equal(gate.exitCode, GATE_EXIT_CODE.VIOLATION);
  assert.equal(gate.target.commit, 'c4');
  assert.equal(gate.historyExecutions, 4);
  assert.deepEqual(gate.metrics, {
    tests: 4,
    passed: 3,
    failures: 1,
    skipped: 0,
    other: 0,
    passRate: 75,
    flakyTests: 2,
    flakyRate: 50,
    durationRegressions: 1
  });
  assert.deepEqual(gate.violations.map(item => item.rule), [
    'min-pass-rate',
    'max-failures',
    'max-flaky-rate',
    'max-duration-regressions'
  ]);
});

test('target selection truncates baseline history so future executions cannot affect a gate', () => {
  const gate = buildQualityGate(fixture, {
    selector: 'c3',
    minPassRate: 0,
    maxFailures: 10,
    maxFlakyRate: 100,
    maxDurationRegressions: 10
  });
  assert.equal(gate.target.commit, 'c3');
  assert.equal(gate.historyExecutions, 3);
  assert.equal(gate.metrics.tests, 3);
  assert.equal(gate.metrics.passRate, 33.33);
  assert.equal(gate.metrics.flakyRate, 66.67);
  assert.equal(gate.metrics.durationRegressions, 0);
});

test('gate forwards duration detector thresholds independently from the allowed regression count', () => {
  const defaultDetector = buildQualityGate(fixture, {
    selector: 'c4',
    minPassRate: 0,
    maxFailures: 10,
    maxFlakyRate: 100,
    maxDurationRegressions: 0
  });
  assert.equal(defaultDetector.metrics.durationRegressions, 1);
  assert.equal(defaultDetector.passed, false);

  const relaxedDetector = buildQualityGate(fixture, {
    selector: 'c4',
    minPassRate: 0,
    maxFailures: 10,
    maxFlakyRate: 100,
    maxDurationRegressions: 0,
    durationRegressionPercent: 60
  });
  assert.equal(relaxedDetector.metrics.durationRegressions, 0);
  assert.equal(relaxedDetector.analyticsConfig.durationRegressionPercent, 60);
  assert.equal(relaxedDetector.passed, true);
});

test('gate validates threshold configuration and missing execution data', () => {
  assert.throws(() => resolveGateOptions({ minPassRate: 101 }), /minPassRate/);
  assert.throws(() => resolveGateOptions({ maxFlakyRate: -1 }), /maxFlakyRate/);
  assert.throws(() => resolveGateOptions({ maxFailures: 1.5 }), /maxFailures/);
  assert.throws(() => resolveGateOptions({ maxDurationRegressions: 'many' }), /maxDurationRegressions/);
  assert.throws(() => buildQualityGate({ executions: [] }), /no executions/);
  assert.throws(() => buildQualityGate(fixture, { selector: 'missing' }), /could not find target execution/);
});

test('human and markdown summaries expose deterministic gate decisions', () => {
  const gate = buildQualityGate(fixture, { selector: 'c4' });
  const text = formatGateSummary(gate);
  const markdown = formatGateMarkdown(gate);
  assert.match(text, /Quality Gate: FAIL/);
  assert.match(text, /Pass rate: 75.00%/);
  assert.match(text, /Duration regressions: 1/);
  assert.match(markdown, /QKTestAnalytics quality gate — ❌ FAIL/);
  assert.match(markdown, /\| Pass rate \| 75.00% \| ≥ 100.00% \| ❌ Fail \|/);
});

test('gate JSON and markdown writers create CI-consumable artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qkta-gate-'));
  const json = path.join(root, 'nested', 'gate.json');
  const markdown = path.join(root, 'nested', 'gate.md');
  const result = writeGateJson(fixture, {
    selector: 'c4',
    output: json,
    minPassRate: 75,
    maxFailures: 1,
    maxFlakyRate: 50,
    maxDurationRegressions: 1
  });
  assert.equal(result.output, json);
  assert.equal(JSON.parse(fs.readFileSync(json, 'utf8')).passed, true);
  assert.equal(writeGateSummary(result.gate, markdown), markdown);
  assert.match(fs.readFileSync(markdown, 'utf8'), /✅ PASS/);
  assert.throws(() => writeGateSummary(result.gate), /output is required/);
});
