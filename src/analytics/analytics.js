import { createTestIdentity } from './identity.js';
import { fingerprintFailure } from './failure.js';

export const ANALYTICS_VERSION = '1.0';
export const DEFAULT_ANALYTICS_OPTIONS = Object.freeze({
  baselineWindow: 5,
  minBaselineSamples: 2,
  durationRegressionPercent: 20,
  durationRegressionMinMs: 100,
  slowLimit: 10
});

const FAILURE_STATUSES = new Set(['FAILED', 'BROKEN', 'ERROR']);
const SKIP_STATUSES = new Set(['SKIPPED', 'PENDING']);
const statusOf = value => String(value ?? 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
const positiveNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};
const integer = (value, fallback, minimum = 1) => {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= minimum ? number : fallback;
};
const round2 = value => Number(value.toFixed(2));

export const isFailureStatus = status => FAILURE_STATUSES.has(statusOf(status));
export const isPassedStatus = status => statusOf(status) === 'PASSED';

export function resolveAnalyticsOptions(options = {}) {
  return {
    baselineWindow: integer(options.baselineWindow, DEFAULT_ANALYTICS_OPTIONS.baselineWindow),
    minBaselineSamples: integer(options.minBaselineSamples, DEFAULT_ANALYTICS_OPTIONS.minBaselineSamples),
    durationRegressionPercent: positiveNumber(
      options.durationRegressionPercent,
      DEFAULT_ANALYTICS_OPTIONS.durationRegressionPercent
    ),
    durationRegressionMinMs: positiveNumber(
      options.durationRegressionMinMs,
      DEFAULT_ANALYTICS_OPTIONS.durationRegressionMinMs
    ),
    slowLimit: integer(options.slowLimit, DEFAULT_ANALYTICS_OPTIONS.slowLimit)
  };
}

export function median(values = []) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function percentile(values = [], percentileValue = 95) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const bounded = Math.min(100, Math.max(0, Number(percentileValue) || 0));
  const index = Math.max(0, Math.ceil((bounded / 100) * sorted.length) - 1);
  return sorted[index];
}

export function orderedExecutions(report = {}) {
  return (report.executions || [])
    .map((execution, index) => ({ execution, index, timestamp: Date.parse(execution.startedAt || '') }))
    .sort((left, right) => {
      if (Number.isFinite(left.timestamp) && Number.isFinite(right.timestamp) && left.timestamp !== right.timestamp) {
        return left.timestamp - right.timestamp;
      }
      return left.index - right.index;
    })
    .map(row => row.execution);
}

const metadataOf = execution => execution?.metadata && typeof execution.metadata === 'object'
  ? execution.metadata
  : {};

export function executionReference(execution = {}) {
  const metadata = metadataOf(execution);
  return {
    id: execution.id ?? null,
    cycle: execution.cycle ?? null,
    project: execution.project ?? null,
    branch: execution.branch ?? metadata.branch ?? metadata.git?.branch ?? null,
    commit: execution.commit ?? metadata.commit ?? metadata.sha ?? metadata.git?.commit ?? null,
    startedAt: execution.startedAt ?? null
  };
}

const durationOf = test => {
  const value = Number(test?.durationMs);
  return Number.isFinite(value) && value >= 0 ? value : 0;
};

export function indexExecutionTests(execution = {}) {
  const groups = new Map();
  for (const [index, test] of (execution.tests || []).entries()) {
    const identity = createTestIdentity(test, execution);
    if (!groups.has(identity.id)) {
      groups.set(identity.id, {
        identity,
        name: test.name || 'Unnamed test',
        suite: test.suite || '',
        project: execution.project || null,
        attempts: []
      });
    }
    const group = groups.get(identity.id);
    const explicitAttempt = Number(test.attempt);
    const retry = Number(test.retry);
    group.attempts.push({
      index,
      attempt: Number.isFinite(explicitAttempt) && explicitAttempt > 0
        ? explicitAttempt
        : Number.isFinite(retry) && retry >= 0 ? retry + 1 : group.attempts.length + 1,
      status: statusOf(test.status),
      durationMs: durationOf(test),
      error: test.error ?? null,
      browser: test.browser ?? null
    });
  }
  return groups;
}

export function detectDurationRegression(trend = [], options = {}) {
  const config = resolveAnalyticsOptions(options);
  const current = trend.at(-1);
  const previous = trend
    .slice(0, -1)
    .filter(point => isPassedStatus(point.status) && point.durationMs > 0)
    .slice(-config.baselineWindow);

  if (!current || !isPassedStatus(current.status) || current.durationMs <= 0
    || previous.length < config.minBaselineSamples) {
    return {
      regressed: false,
      baselineSampleSize: previous.length,
      baselineMedianMs: previous.length ? median(previous.map(point => point.durationMs)) : 0,
      currentDurationMs: current?.durationMs ?? 0,
      deltaMs: 0,
      percentDelta: 0
    };
  }

  const baselineMedianMs = median(previous.map(point => point.durationMs));
  if (baselineMedianMs <= 0) {
    return {
      regressed: false,
      baselineSampleSize: previous.length,
      baselineMedianMs,
      currentDurationMs: current.durationMs,
      deltaMs: 0,
      percentDelta: 0
    };
  }

  const deltaMs = current.durationMs - baselineMedianMs;
  const percentDelta = (deltaMs / baselineMedianMs) * 100;
  return {
    regressed: deltaMs >= config.durationRegressionMinMs
      && percentDelta >= config.durationRegressionPercent,
    baselineSampleSize: previous.length,
    baselineMedianMs,
    currentDurationMs: current.durationMs,
    deltaMs,
    percentDelta: round2(percentDelta)
  };
}

const classify = observations => {
  const statuses = observations.map(observation => observation.finalStatus);
  const passed = statuses.filter(isPassedStatus).length;
  const failed = statuses.filter(isFailureStatus).length;
  const retryFlaky = observations.some(observation => observation.retryFlaky);
  const historyFlaky = passed > 0 && failed > 0;
  if (retryFlaky || historyFlaky) return { classification: 'flaky', retryFlaky, historyFlaky };
  if (failed > 0 && passed === 0) return { classification: 'failing', retryFlaky, historyFlaky };
  if (passed > 0 && failed === 0) return { classification: 'stable', retryFlaky, historyFlaky };
  if (statuses.some(status => SKIP_STATUSES.has(status))) {
    return { classification: 'skipped', retryFlaky, historyFlaky };
  }
  return { classification: 'unknown', retryFlaky, historyFlaky };
};

const failureGroupsFor = observationsByTest => {
  const groups = new Map();
  for (const [stableId, testHistory] of observationsByTest) {
    for (const observation of testHistory.observations) {
      for (const attempt of observation.attempts) {
        const failure = fingerprintFailure(attempt.error);
        if (!failure) continue;
        if (!groups.has(failure.fingerprint)) {
          groups.set(failure.fingerprint, {
            fingerprint: failure.fingerprint,
            normalized: failure.normalized,
            sample: failure.sample,
            occurrences: 0,
            tests: new Set(),
            executions: new Set()
          });
        }
        const group = groups.get(failure.fingerprint);
        group.occurrences++;
        group.tests.add(stableId);
        group.executions.add(observation.execution.id || observation.execution.cycle || 'unknown');
      }
    }
  }

  return [...groups.values()]
    .map(group => ({
      fingerprint: group.fingerprint,
      normalized: group.normalized,
      sample: group.sample,
      occurrences: group.occurrences,
      testCount: group.tests.size,
      executionCount: group.executions.size,
      stableIds: [...group.tests].sort()
    }))
    .sort((left, right) => right.occurrences - left.occurrences || left.fingerprint.localeCompare(right.fingerprint));
};

export function buildAnalytics(report = {}, options = {}) {
  const config = resolveAnalyticsOptions(options);
  const executions = orderedExecutions(report);
  const observationsByTest = new Map();

  for (const execution of executions) {
    const reference = executionReference(execution);
    for (const group of indexExecutionTests(execution).values()) {
      const finalAttempt = group.attempts.at(-1);
      const retryCount = Math.max(0, group.attempts.length - 1);
      const retryFlaky = isPassedStatus(finalAttempt.status)
        && group.attempts.slice(0, -1).some(attempt => isFailureStatus(attempt.status));
      const observation = {
        execution: reference,
        attempts: group.attempts,
        retryCount,
        retryFlaky,
        finalStatus: finalAttempt.status,
        durationMs: finalAttempt.durationMs,
        browser: finalAttempt.browser
      };
      if (!observationsByTest.has(group.identity.id)) {
        observationsByTest.set(group.identity.id, {
          identity: group.identity,
          name: group.name,
          suite: group.suite,
          project: group.project,
          observations: []
        });
      }
      observationsByTest.get(group.identity.id).observations.push(observation);
    }
  }

  const tests = [...observationsByTest.values()].map(group => {
    const observations = group.observations;
    const classification = classify(observations);
    const trend = observations.map(observation => ({
      execution: observation.execution,
      status: observation.finalStatus,
      durationMs: observation.durationMs,
      retryCount: observation.retryCount,
      retryFlaky: observation.retryFlaky
    }));
    const successfulDurations = trend
      .filter(point => isPassedStatus(point.status) && point.durationMs > 0)
      .map(point => point.durationMs);
    const statusCounts = {};
    for (const point of trend) statusCounts[point.status] = (statusCounts[point.status] || 0) + 1;

    const fingerprints = new Map();
    for (const observation of observations) {
      for (const attempt of observation.attempts) {
        const failure = fingerprintFailure(attempt.error);
        if (failure) fingerprints.set(failure.fingerprint, failure.normalized);
      }
    }

    return {
      stableId: group.identity.id,
      identityKey: group.identity.key,
      identityStrategy: group.identity.strategy,
      name: group.name,
      suite: group.suite,
      project: group.project,
      classification: classification.classification,
      retryFlaky: classification.retryFlaky,
      historyFlaky: classification.historyFlaky,
      executions: observations.length,
      retries: observations.reduce((sum, observation) => sum + observation.retryCount, 0),
      retryRuns: observations.filter(observation => observation.retryCount > 0).length,
      statusCounts,
      latest: trend.at(-1) || null,
      duration: {
        samples: successfulDurations.length,
        medianMs: median(successfulDurations),
        p95Ms: percentile(successfulDurations, 95),
        regression: detectDurationRegression(trend, config),
        trend
      },
      failureFingerprints: [...fingerprints.entries()].map(([fingerprint, normalized]) => ({ fingerprint, normalized }))
    };
  }).sort((left, right) => left.stableId.localeCompare(right.stableId));

  const slowTests = tests
    .filter(test => test.duration.p95Ms > 0)
    .slice()
    .sort((left, right) => right.duration.p95Ms - left.duration.p95Ms
      || right.duration.medianMs - left.duration.medianMs
      || left.stableId.localeCompare(right.stableId))
    .slice(0, config.slowLimit)
    .map((test, index) => ({
      rank: index + 1,
      stableId: test.stableId,
      name: test.name,
      suite: test.suite,
      p95Ms: test.duration.p95Ms,
      medianMs: test.duration.medianMs,
      latestDurationMs: test.latest?.durationMs ?? 0,
      latestStatus: test.latest?.status ?? 'UNKNOWN'
    }));
  const failureGroups = failureGroupsFor(observationsByTest);
  const retries = tests.reduce((sum, test) => sum + test.retries, 0);
  const attempts = [...observationsByTest.values()].reduce(
    (sum, group) => sum + group.observations.reduce((inner, observation) => inner + observation.attempts.length, 0),
    0
  );
  const flakyTests = tests.filter(test => test.classification === 'flaky').length;

  return {
    analyticsVersion: ANALYTICS_VERSION,
    schemaVersion: report.schemaVersion ?? null,
    generatedAt: options.generatedAt || report.generatedAt || new Date().toISOString(),
    config,
    summary: {
      executions: executions.length,
      uniqueTests: tests.length,
      attempts,
      retries,
      flakyTests,
      flakyRate: tests.length ? round2((flakyTests / tests.length) * 100) : 0,
      durationRegressions: tests.filter(test => test.duration.regression.regressed).length,
      failureGroups: failureGroups.length
    },
    executions: executions.map(executionReference),
    tests,
    slowTests,
    failureGroups
  };
}
