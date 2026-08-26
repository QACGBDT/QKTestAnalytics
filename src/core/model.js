export const SCHEMA_VERSION = '1.0';

const statusOf = value => String(value || 'UNKNOWN').toUpperCase();

export function normalizeLegacyReport(input = {}, source = 'qk-legacy') {
  const executions = [];
  for (const [cycle, cycleData] of Object.entries(input || {})) {
    for (const [executionId, execution] of Object.entries(cycleData || {})) {
      const summary = execution?.execution_summary || {};
      const tests = [];
      for (const [suiteName, suite] of Object.entries(execution || {})) {
        if (suiteName === 'execution_summary') continue;
        for (const [testName, test] of Object.entries(suite || {})) {
          const testSummary = test?.test_summary || {};
          const steps = Object.entries(test || {})
            .filter(([key]) => key !== 'test_summary')
            .map(([name, data]) => ({ name, ...data }));
          tests.push({
            id: `${executionId}:${suiteName}:${testName}`,
            name: testName,
            suite: suiteName,
            status: statusOf(testSummary.status),
            durationMs: Math.round(Number(testSummary.duration_seconds || 0) * 1000),
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
        durationMs: Math.round(Number(summary.global_time_seconds || 0) * 1000),
        tests
      });
    }
  }
  return { schemaVersion: SCHEMA_VERSION, generatedAt: new Date().toISOString(), executions };
}

export function summarizeExecutions(executions = []) {
  const tests = executions.flatMap(e => e.tests || []);
  const passed = tests.filter(t => t.status === 'PASSED').length;
  const failed = tests.filter(t => t.status === 'FAILED').length;
  const skipped = tests.filter(t => ['SKIPPED', 'PENDING'].includes(t.status)).length;
  return {
    executions: executions.length,
    tests: tests.length,
    passed,
    failed,
    skipped,
    other: Math.max(0, tests.length - passed - failed - skipped),
    passRate: tests.length ? Number(((passed / tests.length) * 100).toFixed(2)) : 0,
    durationMs: tests.reduce((sum, t) => sum + Number(t.durationMs || 0), 0)
  };
}
