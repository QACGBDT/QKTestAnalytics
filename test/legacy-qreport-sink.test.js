import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ExecutionDataManager,
  LegacyQReportSink,
  ReporterEventType,
  ReporterRuntime
} from '../src/index.js';

const fixture = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qkta-legacy-sink-'));
  const filePath = path.join(directory, 'reports', 'current.json');
  const manager = new ExecutionDataManager({ filePath, runId: 'run-1' });
  const sink = new LegacyQReportSink(manager);
  const times = [
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:01.000Z',
    '2026-01-01T00:00:02.000Z',
    '2026-01-01T00:00:03.000Z',
    '2026-01-01T00:00:04.000Z',
    '2026-01-01T00:00:05.000Z',
    '2026-01-01T00:00:06.000Z'
  ];
  const runtime = new ReporterRuntime({ sinks: [sink], clock: () => times.shift() });
  return { manager, runtime };
};

test('maps canonical lifecycle, failure and screenshot evidence to legacy QReport JSON', async () => {
  const { manager, runtime } = fixture();
  await runtime.emit(ReporterEventType.RUN_START, {
    projectName: 'shop', framework: 'webdriverio-cucumber', browser: 'chrome', specs: ['checkout.feature']
  });
  await runtime.emit(ReporterEventType.SCENARIO_START, {
    scenarioId: 's1', featureName: 'Checkout.v2', name: 'declined.card', browser: 'chrome', tags: ['@smoke']
  });
  await runtime.emit(ReporterEventType.STEP_START, { scenarioId: 's1', stepId: 'st1', name: 'I pay', keyword: 'When' });
  await runtime.emit(ReporterEventType.EVIDENCE, {
    scenarioId: 's1', stepId: 'st1', artifact: {
      kind: 'screenshot', name: 'Screenshot', mimeType: 'image/png', path: 'img_1.png',
      relativePath: 'media-bucket/screenshots/img_1.png', size: 10
    }
  });
  await runtime.emit(ReporterEventType.STEP_END, {
    scenarioId: 's1', stepId: 'st1', status: 'FAILED', error: 'boom', durationMs: 1250
  });
  await runtime.emit(ReporterEventType.SCENARIO_END, {
    scenarioId: 's1', status: 'FAILED', error: 'boom', durationMs: 2000
  });
  await runtime.emit(ReporterEventType.RUN_END, { exitCode: 1, durationMs: 6000 });

  const run = manager.getAllData()['run-1'];
  assert.equal(run.execution_summary.project_name, 'shop');
  assert.equal(run.execution_summary.exit_code, 1);
  assert.equal(run['Checkout․v2']['declined․card'].test_summary.status, 'FAILED');
  const step = run['Checkout․v2']['declined․card']['I pay'];
  assert.equal(step.status, 'FAILED');
  assert.equal(step.error, 'boom');
  assert.equal(step.duration_seconds, 1.25);
  assert.equal(step.screenshot_path, 'img_1.png');
  assert.equal(step.evidence[0].path, 'media-bucket/screenshots/img_1.png');
});

test('deduplicates repeated legacy step names and ignores feature-only events', async () => {
  const { manager, runtime } = fixture();
  await runtime.emit(ReporterEventType.FEATURE_START, { name: 'Login' });
  await runtime.emit(ReporterEventType.SCENARIO_START, { scenarioId: 's1', featureName: 'Login', name: 'works' });
  await runtime.emit(ReporterEventType.STEP_START, { scenarioId: 's1', stepId: 'a', name: 'repeat' });
  await runtime.emit(ReporterEventType.STEP_END, { scenarioId: 's1', stepId: 'a', status: 'PASSED' });
  await runtime.emit(ReporterEventType.STEP_START, { scenarioId: 's1', stepId: 'b', name: 'repeat' });
  await runtime.emit(ReporterEventType.STEP_END, { scenarioId: 's1', stepId: 'b', status: 'PASSED' });
  const data = manager.getAllData()['run-1'].Login.works;
  assert.equal(data.repeat.status, 'PASSED');
  assert.equal(data['repeat [2]'].status, 'PASSED');
});

test('rejects events that reference unknown scenarios or steps', async () => {
  const { runtime } = fixture();
  await assert.rejects(
    () => runtime.emit(ReporterEventType.SCENARIO_START, { featureName: 'x' }),
    /scenario:start requires/
  );
  await assert.rejects(
    () => runtime.emit(ReporterEventType.STEP_START, { scenarioId: 'missing', stepId: 'x' }),
    /unknown scenario/
  );
  await runtime.emit(ReporterEventType.SCENARIO_START, { scenarioId: 's', name: 'scenario' });
  await assert.rejects(
    () => runtime.emit(ReporterEventType.STEP_END, { scenarioId: 's', stepId: 'missing' }),
    /unknown step/
  );
});

test('constructor requires a compatible manager', () => {
  assert.throws(() => new LegacyQReportSink(), /ExecutionDataManager-compatible/);
});
