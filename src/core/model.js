export const SCHEMA_VERSION = '1.0';

const statusOf = value => String(value ?? 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
const entriesOf = value => value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : [];
const secondsToMs = value => {
  const seconds = Number(value ?? 0);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
};
const durationOf = value => {
  const duration = Number(value ?? 0);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
};

export function normalizeLegacyReport(input = {}, source = 'qk-legacy') {
  const executions = [];
  for (const [cycle, cycleData] of entriesOf(input)) {
    for (const [executionId, execution] of entriesOf(cycleData)) {
      const summary = execution?.execution_summary || {};
      const tests = [];
      for (const [suiteName, suite] of entriesOf(execution)) {
        if (suiteName === 'execution_summary') continue;
        for (const [testName, test] of entriesOf(suite)) {
          const testSummary = test?.test_summary || {};
          const steps = entriesOf(test)
            .filter(([key]) => key !== 'test_summary')
            .map(([name, data]) => ({
              name,
              ...(data && typeof data === 'object' && !Array.isArray(data) ? data : { value: data })
            }));
          tests.push({
            id: `${executionId}:${suiteName}:${testName}`,
            name: testName,
            suite: suiteName,
            status: statusOf(testSummary.status),
            durationMs: secondsToMs(testSummary.duration_seconds),
            browser: testSummary.browser || null,
            error: testSummary.error || null,
            video: testSummary.video_path || null,
            steps
          });
        }
      }
      executions.push({
        id: executionId,
        cycle,
        source,
        project: summary.project_name || null,
        startedAt: summary.global_start_time || null,
        endedAt: summary.global_end_time || null,
        durationMs: secondsToMs(summary.global_time_seconds),
        tests
      });
    }
  }
  return { schemaVersion: SCHEMA_VERSION, generatedAt: new Date().toISOString(), executions };
}

export function summarizeExecutions(executions = []) {
  const tests = executions.flatMap(execution => execution.tests || []);
  const passed = tests.filter(test => test.status === 'PASSED').length;
  const failed = tests.filter(test => test.status === 'FAILED').length;
  const skipped = tests.filter(test => ['SKIPPED', 'PENDING'].includes(test.status)).length;
  return {
    executions: executions.length,
    tests: tests.length,
    passed,
    failed,
    skipped,
    other: Math.max(0, tests.length - passed - failed - skipped),
    passRate: tests.length ? Number(((passed / tests.length) * 100).toFixed(2)) : 0,
    durationMs: tests.reduce((sum, test) => sum + durationOf(test.durationMs), 0)
  };
}
