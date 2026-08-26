import { fingerprintFailure } from './failure.js';
import {
  executionReference,
  indexExecutionTests,
  isFailureStatus,
  isPassedStatus,
  orderedExecutions,
  resolveAnalyticsOptions
} from './analytics.js';

const selectorText = selector => typeof selector === 'string' ? selector.trim() : '';

const matchesSelector = (execution, selector) => {
  const reference = executionReference(execution);
  if (typeof selector === 'string') {
    const value = selectorText(selector);
    return [reference.id, reference.cycle, reference.branch, reference.commit, reference.project]
      .some(candidate => candidate !== null && String(candidate) === value);
  }
  if (!selector || typeof selector !== 'object') return false;
  return Object.entries(selector).every(([key, value]) => reference[key] !== undefined
    && reference[key] !== null
    && String(reference[key]) === String(value));
};

export function selectExecution(report = {}, selector) {
  if (selector?.tests && Array.isArray(selector.tests)) return selector;
  const matches = orderedExecutions(report).filter(execution => matchesSelector(execution, selector));
  return matches.at(-1) || null;
}

const finalTests = execution => {
  const indexed = new Map();
  for (const [stableId, group] of indexExecutionTests(execution)) {
    const finalAttempt = group.attempts.at(-1);
    indexed.set(stableId, {
      stableId,
      name: group.name,
      suite: group.suite,
      status: finalAttempt.status,
      durationMs: finalAttempt.durationMs,
      error: finalAttempt.error
    });
  }
  return indexed;
};

const summarize = tests => {
  const values = [...tests.values()];
  const passed = values.filter(test => isPassedStatus(test.status)).length;
  const failed = values.filter(test => isFailureStatus(test.status)).length;
  return {
    tests: values.length,
    passed,
    failed,
    passRate: values.length ? Number(((passed / values.length) * 100).toFixed(2)) : 0,
    durationMs: values.reduce((sum, test) => sum + test.durationMs, 0)
  };
};

const durationChange = (base, head, config) => {
  if (!isPassedStatus(base.status) || !isPassedStatus(head.status)
    || base.durationMs <= 0 || head.durationMs <= 0) return null;
  const deltaMs = head.durationMs - base.durationMs;
  const percentDelta = (deltaMs / base.durationMs) * 100;
  return {
    stableId: base.stableId,
    name: head.name,
    suite: head.suite,
    baseDurationMs: base.durationMs,
    headDurationMs: head.durationMs,
    deltaMs,
    percentDelta: Number(percentDelta.toFixed(2)),
    regressed: deltaMs >= config.durationRegressionMinMs
      && percentDelta >= config.durationRegressionPercent
  };
};

const fingerprintMap = tests => {
  const map = new Map();
  for (const test of tests.values()) {
    const failure = fingerprintFailure(test.error);
    if (failure) map.set(failure.fingerprint, { ...failure, stableId: test.stableId, name: test.name });
  }
  return map;
};

export function compareExecutions(baseExecution, headExecution, options = {}) {
  if (!baseExecution || !headExecution) throw new TypeError('base and head executions are required');
  const config = resolveAnalyticsOptions(options);
  const baseTests = finalTests(baseExecution);
  const headTests = finalTests(headExecution);
  const added = [];
  const removed = [];
  const statusRegressions = [];
  const statusImprovements = [];
  const statusChanges = [];
  const durationChanges = [];

  for (const [stableId, head] of headTests) {
    const base = baseTests.get(stableId);
    if (!base) {
      added.push(head);
      continue;
    }
    if (base.status !== head.status) {
      const change = {
        stableId,
        name: head.name,
        suite: head.suite,
        from: base.status,
        to: head.status
      };
      if (isPassedStatus(base.status) && isFailureStatus(head.status)) statusRegressions.push(change);
      else if (isFailureStatus(base.status) && isPassedStatus(head.status)) statusImprovements.push(change);
      else statusChanges.push(change);
    }
    const change = durationChange(base, head, config);
    if (change) durationChanges.push(change);
  }

  for (const [stableId, base] of baseTests) {
    if (!headTests.has(stableId)) removed.push(base);
  }

  const baseFailures = fingerprintMap(baseTests);
  const headFailures = fingerprintMap(headTests);
  const newFailureFingerprints = [...headFailures.values()].filter(failure => !baseFailures.has(failure.fingerprint));
  const resolvedFailureFingerprints = [...baseFailures.values()].filter(failure => !headFailures.has(failure.fingerprint));
  const baseSummary = summarize(baseTests);
  const headSummary = summarize(headTests);

  return {
    analyticsVersion: '1.0',
    base: executionReference(baseExecution),
    head: executionReference(headExecution),
    config: {
      durationRegressionPercent: config.durationRegressionPercent,
      durationRegressionMinMs: config.durationRegressionMinMs
    },
    summary: {
      base: baseSummary,
      head: headSummary,
      delta: {
        tests: headSummary.tests - baseSummary.tests,
        passed: headSummary.passed - baseSummary.passed,
        failed: headSummary.failed - baseSummary.failed,
        passRate: Number((headSummary.passRate - baseSummary.passRate).toFixed(2)),
        durationMs: headSummary.durationMs - baseSummary.durationMs
      }
    },
    added: added.sort((a, b) => a.stableId.localeCompare(b.stableId)),
    removed: removed.sort((a, b) => a.stableId.localeCompare(b.stableId)),
    statusRegressions,
    statusImprovements,
    statusChanges,
    durationChanges: durationChanges.slice().sort((a, b) => b.percentDelta - a.percentDelta),
    durationRegressions: durationChanges.filter(change => change.regressed)
      .sort((a, b) => b.percentDelta - a.percentDelta),
    newFailureFingerprints,
    resolvedFailureFingerprints
  };
}

export function compareReportExecutions(report = {}, baseSelector, headSelector, options = {}) {
  const base = selectExecution(report, baseSelector);
  const head = selectExecution(report, headSelector);
  if (!base) throw new Error(`could not find base execution: ${String(baseSelector)}`);
  if (!head) throw new Error(`could not find head execution: ${String(headSelector)}`);
  return compareExecutions(base, head, options);
}
