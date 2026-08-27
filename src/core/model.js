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

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const isExecution = value => isObject(value) && isObject(value.execution_summary);
const isTest = value => isObject(value) && isObject(value.test_summary);

const legacyExecutions = (input, diagnostics) => {
  const rows = [];
  if (isExecution(input)) {
    rows.push({ cycle: 'Current cycle', id: 'current', execution: input });
    return rows;
  }

  for (const [cycle, cycleData] of entriesOf(input)) {
    if (isExecution(cycleData)) {
      rows.push({ cycle, id: 'current', execution: cycleData });
      continue;
    }

    const executions = entriesOf(cycleData).filter(([, value]) => isExecution(value));
    if (executions.length) {
      for (const [id, execution] of executions) rows.push({ cycle, id, execution });
    } else if (isObject(cycleData)) {
      diagnostics.push({
        code: 'UNSUPPORTED_LEGACY_SHAPE',
        message: 'Skipped an unsupported legacy report shape; no execution_summary envelope was found.'
      });
    }
  }
  return rows;
};

export function normalizeLegacyReport(input = {}, source = 'qk-legacy') {
  const executions = [];
  const diagnostics = [];
  for (const { cycle, id: executionId, execution } of legacyExecutions(input, diagnostics)) {
      const summary = execution.execution_summary;
      const tests = [];
      for (const [suiteName, suite] of entriesOf(execution)) {
        if (suiteName === 'execution_summary') continue;
        for (const [testName, test] of entriesOf(suite)) {
          if (!isTest(test)) {
            diagnostics.push({
              code: 'UNSUPPORTED_LEGACY_TEST_NODE',
              message: 'Skipped a legacy node without a test_summary object; structural report nodes are not tests.'
            });
            continue;
          }
          const testSummary = test.test_summary;
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
  return { schemaVersion: SCHEMA_VERSION, generatedAt: new Date().toISOString(), executions, diagnostics };
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
