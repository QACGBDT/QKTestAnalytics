import fs from 'node:fs';
import path from 'node:path';
import {
  buildAnalytics,
  executionReference,
  indexExecutionTests,
  isFailureStatus,
  isPassedStatus,
  orderedExecutions
} from './analytics.js';
import { selectExecution } from './compare.js';
import { writeJsonArtifact } from './export.js';

export const GATE_VERSION = '1.0';
export const GATE_EXIT_CODE = Object.freeze({
  PASS: 0,
  ERROR: 1,
  VIOLATION: 2
});
export const DEFAULT_GATE_OPTIONS = Object.freeze({
  minPassRate: 100,
  maxFailures: 0,
  maxFlakyRate: 0,
  maxDurationRegressions: 0
});

const round2 = value => Number(value.toFixed(2));
const numberOption = (name, value, fallback, { max = Number.POSITIVE_INFINITY, integer = false } = {}) => {
  const resolved = value ?? fallback;
  const number = Number(resolved);
  if (!Number.isFinite(number) || number < 0 || number > max || (integer && !Number.isInteger(number))) {
    const range = Number.isFinite(max) ? ` between 0 and ${max}` : ' greater than or equal to 0';
    const whole = integer ? ' whole number' : ' number';
    throw new TypeError(`${name} must be a${whole}${range}`);
  }
  return number;
};

export function resolveGateOptions(options = {}) {
  return {
    minPassRate: numberOption('minPassRate', options.minPassRate, DEFAULT_GATE_OPTIONS.minPassRate, { max: 100 }),
    maxFailures: numberOption('maxFailures', options.maxFailures, DEFAULT_GATE_OPTIONS.maxFailures, { integer: true }),
    maxFlakyRate: numberOption('maxFlakyRate', options.maxFlakyRate, DEFAULT_GATE_OPTIONS.maxFlakyRate, { max: 100 }),
    maxDurationRegressions: numberOption(
      'maxDurationRegressions',
      options.maxDurationRegressions,
      DEFAULT_GATE_OPTIONS.maxDurationRegressions,
      { integer: true }
    )
  };
}

const selectTargetExecution = (report, selector) => {
  const executions = orderedExecutions(report);
  const target = selector === undefined || selector === null
    ? executions.at(-1) || null
    : selectExecution(report, selector);
  if (!target) {
    if (selector === undefined || selector === null) throw new Error('no executions are available for quality-gate evaluation');
    throw new Error(`could not find target execution: ${String(selector)}`);
  }
  return { target, executions };
};

const reportThroughTarget = (report, target, executions) => {
  const index = executions.indexOf(target);
  return {
    ...report,
    executions: index >= 0 ? executions.slice(0, index + 1) : [target]
  };
};

const targetMetrics = (target, analytics) => {
  const groups = indexExecutionTests(target);
  const finalStatuses = [...groups.values()].map(group => group.attempts.at(-1)?.status || 'UNKNOWN');
  const tests = finalStatuses.length;
  const passed = finalStatuses.filter(isPassedStatus).length;
  const failures = finalStatuses.filter(isFailureStatus).length;
  const skipped = finalStatuses.filter(status => ['SKIPPED', 'PENDING'].includes(status)).length;
  const targetIds = new Set(groups.keys());
  const targetAnalytics = analytics.tests.filter(test => targetIds.has(test.stableId));
  const flakyTests = targetAnalytics.filter(test => test.classification === 'flaky').length;
  const durationRegressions = targetAnalytics.filter(test => test.duration.regression.regressed).length;

  return {
    tests,
    passed,
    failures,
    skipped,
    other: Math.max(0, tests - passed - failures - skipped),
    passRate: tests ? round2((passed / tests) * 100) : 0,
    flakyTests,
    flakyRate: tests ? round2((flakyTests / tests) * 100) : 0,
    durationRegressions
  };
};

const violation = (rule, metric, actual, operator, threshold, message) => ({
  rule,
  metric,
  actual,
  operator,
  threshold,
  message
});

export function buildQualityGate(report = {}, options = {}) {
  const thresholds = resolveGateOptions(options);
  const { target, executions } = selectTargetExecution(report, options.selector ?? options.target);
  const scopedReport = reportThroughTarget(report, target, executions);
  const analytics = buildAnalytics(scopedReport, options);
  const metrics = targetMetrics(target, analytics);
  const violations = [];

  if (metrics.passRate < thresholds.minPassRate) {
    violations.push(violation(
      'min-pass-rate',
      'passRate',
      metrics.passRate,
      '>=',
      thresholds.minPassRate,
      `Pass rate ${metrics.passRate}% is below the minimum ${thresholds.minPassRate}%.`
    ));
  }
  if (metrics.failures > thresholds.maxFailures) {
    violations.push(violation(
      'max-failures',
      'failures',
      metrics.failures,
      '<=',
      thresholds.maxFailures,
      `Failures ${metrics.failures} exceed the maximum ${thresholds.maxFailures}.`
    ));
  }
  if (metrics.flakyRate > thresholds.maxFlakyRate) {
    violations.push(violation(
      'max-flaky-rate',
      'flakyRate',
      metrics.flakyRate,
      '<=',
      thresholds.maxFlakyRate,
      `Flaky rate ${metrics.flakyRate}% exceeds the maximum ${thresholds.maxFlakyRate}%.`
    ));
  }
  if (metrics.durationRegressions > thresholds.maxDurationRegressions) {
    violations.push(violation(
      'max-duration-regressions',
      'durationRegressions',
      metrics.durationRegressions,
      '<=',
      thresholds.maxDurationRegressions,
      `Duration regressions ${metrics.durationRegressions} exceed the maximum ${thresholds.maxDurationRegressions}.`
    ));
  }

  return {
    gateVersion: GATE_VERSION,
    analyticsVersion: analytics.analyticsVersion,
    schemaVersion: report.schemaVersion ?? null,
    generatedAt: options.generatedAt || report.generatedAt || new Date().toISOString(),
    passed: violations.length === 0,
    exitCode: violations.length === 0 ? GATE_EXIT_CODE.PASS : GATE_EXIT_CODE.VIOLATION,
    target: executionReference(target),
    historyExecutions: scopedReport.executions.length,
    thresholds,
    analyticsConfig: analytics.config,
    metrics,
    violations
  };
}

const percent = value => `${Number(value).toFixed(2)}%`;
const targetLabel = target => {
  const revision = [target.branch, target.commit].filter(Boolean).join('@');
  return revision || target.id || target.cycle || target.project || 'unknown';
};

export function formatGateSummary(gate) {
  const status = gate.passed ? 'PASS' : 'FAIL';
  const lines = [
    `[QKTestAnalytics] Quality Gate: ${status}`,
    `Target: ${targetLabel(gate.target)} (${gate.historyExecutions} execution${gate.historyExecutions === 1 ? '' : 's'} in baseline history)`,
    `Pass rate: ${percent(gate.metrics.passRate)} (minimum ${percent(gate.thresholds.minPassRate)})`,
    `Failures: ${gate.metrics.failures} (maximum ${gate.thresholds.maxFailures})`,
    `Flaky rate: ${percent(gate.metrics.flakyRate)} (maximum ${percent(gate.thresholds.maxFlakyRate)})`,
    `Duration regressions: ${gate.metrics.durationRegressions} (maximum ${gate.thresholds.maxDurationRegressions})`
  ];
  if (gate.violations.length) {
    lines.push('Violations:');
    for (const item of gate.violations) lines.push(`- ${item.message}`);
  }
  return lines.join('\n');
}

const markdownEscape = value => String(value ?? '').replaceAll('|', '\\|');
export function formatGateMarkdown(gate) {
  const failedRules = new Set(gate.violations.map(item => item.rule));
  const row = (rule, label, actual, requirement) => `| ${label} | ${actual} | ${requirement} | ${failedRules.has(rule) ? '❌ Fail' : '✅ Pass'} |`;
  const lines = [
    `## QKTestAnalytics quality gate — ${gate.passed ? '✅ PASS' : '❌ FAIL'}`,
    '',
    `**Target:** ${markdownEscape(targetLabel(gate.target))}  `,
    `**Baseline history:** ${gate.historyExecutions} execution${gate.historyExecutions === 1 ? '' : 's'}`,
    '',
    '| Gate | Actual | Requirement | Result |',
    '| --- | ---: | ---: | --- |',
    row('min-pass-rate', 'Pass rate', percent(gate.metrics.passRate), `≥ ${percent(gate.thresholds.minPassRate)}`),
    row('max-failures', 'Failures', gate.metrics.failures, `≤ ${gate.thresholds.maxFailures}`),
    row('max-flaky-rate', 'Flaky rate', percent(gate.metrics.flakyRate), `≤ ${percent(gate.thresholds.maxFlakyRate)}`),
    row('max-duration-regressions', 'Duration regressions', gate.metrics.durationRegressions, `≤ ${gate.thresholds.maxDurationRegressions}`)
  ];
  if (gate.violations.length) {
    lines.push('', '### Violations');
    for (const item of gate.violations) lines.push(`- ${markdownEscape(item.message)}`);
  }
  return `${lines.join('\n')}\n`;
}

export function writeGateJson(report, options = {}) {
  const output = options.output || 'qreport-results/gate.json';
  const gate = buildQualityGate(report, options);
  writeJsonArtifact(gate, output);
  return { output, gate };
}

export function writeGateSummary(gate, output) {
  if (!output) throw new TypeError('output is required');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, formatGateMarkdown(gate), 'utf8');
  return output;
}
