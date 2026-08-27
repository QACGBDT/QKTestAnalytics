import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ReporterEventType,
  ReporterRuntime,
  ExecutionDataManager,
  LegacyQReportSink,
  WdioCucumberAdapter,
  buildReport,
  createWdioCucumberAdapter,
  createWdioCucumberHooks
} from '../src/index.js';

const tempPaths = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qkta-wdio-'));
  return {
    filePath: path.join(root, 'reports', 'current.json'),
    evidenceRoot: path.join(root, 'media-bucket')
  };
};

const world = (id = 'scenario-1', name = 'checkout works') => ({
  pickle: { id, name, tags: [{ name: '@smoke' }] },
  gherkinDocument: { feature: { name: 'Checkout' } }
});

const step = (id = 'step-1', text = 'I submit payment') => ({ id, text, keyword: 'When ' });

test('default adapter writes a passing WDIO/Cucumber lifecycle without failure screenshots', async () => {
  const paths = tempPaths();
  let screenshots = 0;
  const session = {
    capabilities: { browserName: 'chrome' },
    async takeScreenshot() { screenshots++; return Buffer.from('shot').toString('base64'); }
  };
  const adapter = createWdioCucumberAdapter({
    ...paths,
    runId: 'worker-1',
    projectName: 'checkout-suite',
    now: () => 1000
  });

  await adapter.hooks.before({ browserName: 'chrome' }, ['checkout.feature'], session);
  await adapter.hooks.beforeFeature('checkout.feature', { name: 'Checkout' });
  await adapter.hooks.beforeScenario(world());
  await adapter.hooks.beforeStep(step(), world().pickle);
  await adapter.hooks.afterStep(step(), world().pickle, { passed: true, duration: 150 });
  await adapter.hooks.afterScenario(world(), { passed: true, duration: 200 });
  await adapter.hooks.afterFeature('checkout.feature', { name: 'Checkout' });
  await adapter.hooks.after(0);

  const data = JSON.parse(fs.readFileSync(paths.filePath, 'utf8'))['worker-1'];
  assert.equal(data.execution_summary.project_name, 'checkout-suite');
  assert.equal(data.Checkout['checkout works'].test_summary.status, 'PASSED');
  assert.equal(data.Checkout['checkout works']['I submit payment'].status, 'PASSED');
  assert.equal(data.Checkout['checkout works'].test_summary.browser, 'chrome');
  assert.equal(screenshots, 0);
});

test('default adapter wraps its output and builds one passed scenario without UNKNOWN pseudo-tests', async () => {
  const paths = tempPaths();
  const adapter = createWdioCucumberAdapter({ ...paths, capture: 'never', now: () => 1000 });

  await adapter.hooks.before({ browserName: 'chrome' });
  await adapter.hooks.beforeFeature('checkout.feature', { name: 'Checkout' });
  await adapter.hooks.beforeScenario(world());
  await adapter.hooks.beforeStep(step(), world().pickle);
  await adapter.hooks.afterStep(step(), world().pickle, { passed: true, duration: 100 });
  await adapter.hooks.afterScenario(world(), { passed: true, duration: 200 });
  await adapter.hooks.after(0);

  const raw = JSON.parse(fs.readFileSync(paths.filePath, 'utf8'));
  const runId = Object.keys(raw)[0];
  assert.match(runId, /^run-/);
  assert.ok(raw[runId].execution_summary);

  const output = path.join(path.dirname(paths.filePath), 'report.html');
  const result = buildReport({ output, data: { 'Current cycle': raw } });
  assert.deepEqual(result.summary, {
    executions: 1, tests: 1, passed: 1, failed: 0, skipped: 0,
    other: 0, passRate: 100, durationMs: 200
  });
  assert.equal(result.model.executions[0].tests[0].name, 'checkout works');
  assert.equal(result.model.executions[0].tests[0].steps[0].status, 'PASSED');
  assert.equal(result.model.diagnostics.length, 0);
  assert.doesNotMatch(fs.readFileSync(output, 'utf8'), /test_summary.*UNKNOWN/);
});

test('failure flow captures screenshot through injected WDIO session and preserves error', async () => {
  const paths = tempPaths();
  const session = {
    async takeScreenshot() { return Buffer.from('failure-shot').toString('base64'); }
  };
  const adapter = createWdioCucumberAdapter({
    ...paths,
    runId: 'run',
    uuid: () => 'failure',
    capture: 'on-failure'
  });

  await adapter.hooks.before({ browserName: 'firefox' }, [], session);
  await adapter.hooks.beforeFeature('x.feature', { name: 'Checkout' });
  await adapter.hooks.beforeScenario(world());
  await adapter.hooks.beforeStep(step(), world().pickle);
  await adapter.hooks.afterStep(step(), world().pickle, {
    passed: false,
    duration: 25,
    error: new Error('payment rejected')
  });
  await adapter.hooks.afterScenario(world(), { passed: false, duration: 30, error: 'scenario failed' });

  const run = JSON.parse(fs.readFileSync(paths.filePath, 'utf8')).run;
  const stepData = run.Checkout['checkout works']['I submit payment'];
  assert.equal(stepData.status, 'FAILED');
  assert.match(stepData.error, /payment rejected/);
  assert.equal(stepData.screenshot_path, 'img_failure.png');
  assert.equal(
    fs.readFileSync(path.join(paths.evidenceRoot, 'screenshots', 'img_failure.png'), 'utf8'),
    'failure-shot'
  );
});

test('adapter can attach custom evidence to the active step', async () => {
  const paths = tempPaths();
  const adapter = createWdioCucumberAdapter({ ...paths, uuid: () => 'custom', capture: 'never' });
  await adapter.hooks.before({}, [], {});
  await adapter.hooks.beforeScenario(world());
  await adapter.hooks.beforeStep(step(), world().pickle);
  const artifact = await adapter.attachEvidence({ requestId: 42 }, {
    name: 'request', mimeType: 'application/json'
  });
  assert.equal(artifact.path, 'evidence_custom.json');
  const data = JSON.parse(fs.readFileSync(paths.filePath, 'utf8'));
  const run = data[Object.keys(data)[0]];
  assert.equal(run.Checkout['checkout works']['I submit payment'].evidence[0].name, 'request');
});

test('always capture mode captures passing steps too', async () => {
  const events = [];
  const runtime = new ReporterRuntime({ sinks: [event => events.push(event)] });
  const evidenceStore = { save: input => ({ kind: input.kind, path: 'x.png', relativePath: 'media-bucket/screenshots/x.png' }) };
  const adapter = new WdioCucumberAdapter({ runtime, evidenceStore, capture: 'always' });
  await adapter.before({}, [], { takeScreenshot: async () => 'abc' });
  await adapter.beforeScenario(world());
  await adapter.beforeStep(step(), world().pickle);
  await adapter.afterStep(step(), world().pickle, { passed: true, duration: 1 });
  assert.equal(events.filter(event => event.type === ReporterEventType.EVIDENCE).length, 1);
});

test('screenshot failures are reported through callback without masking test result', async () => {
  const events = [];
  const errors = [];
  const runtime = new ReporterRuntime({ sinks: [event => events.push(event)] });
  const adapter = new WdioCucumberAdapter({
    runtime,
    capture: 'on-failure',
    onEvidenceError: error => errors.push(error)
  });
  await adapter.before({}, [], {});
  await adapter.beforeScenario(world());
  await adapter.beforeStep(step(), world().pickle);
  await adapter.afterStep(step(), world().pickle, { passed: false, error: { message: 'failed' } });
  const ended = events.find(event => event.type === ReporterEventType.STEP_END);
  assert.match(ended.payload.evidenceError, /takeScreenshot/);
  assert.equal(errors.length, 1);
  assert.equal(ended.payload.status, 'FAILED');
});

test('explicit evidence target supports async stores and validates missing targets', async () => {
  const events = [];
  const runtime = new ReporterRuntime({ sinks: [event => events.push(event)] });
  const adapter = new WdioCucumberAdapter({
    runtime,
    evidenceStore: { save: async () => ({ kind: 'attachment', path: 'a.bin' }) },
    capture: 'never'
  });
  const artifact = await adapter.attachEvidence('x', { scenarioId: 's', stepId: 'st' });
  assert.equal(artifact.path, 'a.bin');
  assert.equal(events[0].payload.scenarioId, 's');
  await assert.rejects(() => adapter.attachEvidence('x'), /requires an active or explicit/);
  await assert.rejects(() => adapter.captureScreenshot({ scenarioId: 's', stepId: 'st' }), /takeScreenshot/);
});

test('uses session capabilities and project environment fallbacks when explicit metadata is absent', async () => {
  const events = [];
  const previous = process.env.QKTA_PROJECT;
  process.env.QKTA_PROJECT = 'env-project';
  try {
    const runtime = new ReporterRuntime({ sinks: [event => events.push(event)] });
    const adapter = new WdioCucumberAdapter({ runtime, capture: 'never', now: () => 10 });
    await adapter.before({}, 'not-an-array', { capabilities: { browserName: 'edge' } });
    await adapter.after(undefined);
    const started = events.find(event => event.type === ReporterEventType.RUN_START);
    const ended = events.find(event => event.type === ReporterEventType.RUN_END);
    assert.equal(started.payload.projectName, 'env-project');
    assert.equal(started.payload.browser, 'edge');
    assert.deepEqual(started.payload.specs, []);
    assert.equal(ended.payload.exitCode, undefined);
  } finally {
    if (previous === undefined) delete process.env.QKTA_PROJECT;
    else process.env.QKTA_PROJECT = previous;
  }
});

test('factories expose the documented hook surface and allow custom runtimes', () => {
  const runtime = new ReporterRuntime();
  const adapter = createWdioCucumberAdapter({ runtime, capture: 'never' });
  assert.equal(adapter.name, 'wdio-cucumber');
  assert.equal(adapter.manager, null);
  assert.deepEqual(Object.keys(adapter.hooks).sort(), [
    'after', 'afterFeature', 'afterScenario', 'afterStep',
    'before', 'beforeFeature', 'beforeScenario', 'beforeStep'
  ]);
  assert.deepEqual(Object.keys(createWdioCucumberHooks({ runtime, capture: 'never' })).sort(), Object.keys(adapter.hooks).sort());
});

test('adapter validates runtime and capture configuration', () => {
  assert.throws(() => new WdioCucumberAdapter(), /requires a ReporterRuntime/);
  assert.throws(
    () => new WdioCucumberAdapter({ runtime: new ReporterRuntime(), capture: 'sometimes' }),
    /unsupported evidence capture mode/
  );
});

test('fallback scenario/step identities and status values remain deterministic', async () => {
  const events = [];
  const nowValues = [100, 150, 200, 300, 400];
  const runtime = new ReporterRuntime({ sinks: [event => events.push(event)] });
  const adapter = new WdioCucumberAdapter({ runtime, capture: 'never', now: () => nowValues.shift() ?? 500 });
  await adapter.before({}, [], null);
  await adapter.beforeScenario({ pickle: {} });
  await adapter.beforeStep({}, {});
  await adapter.afterStep({}, {}, { status: ' skipped ' });
  await adapter.afterScenario({}, { status: 'pending' });
  const stepEnd = events.find(event => event.type === ReporterEventType.STEP_END);
  const scenarioEnd = events.find(event => event.type === ReporterEventType.SCENARIO_END);
  assert.equal(stepEnd.payload.status, 'SKIPPED');
  assert.equal(scenarioEnd.payload.status, 'PENDING');
  assert.ok(stepEnd.payload.durationMs >= 0);
});

test('redacts configured secrets before event sinks, legacy JSON, evidence metadata and HTML', async () => {
  const paths = tempPaths();
  const secret = 'correct-horse-battery-staple';
  const events = [];
  const manager = new ExecutionDataManager({ filePath: paths.filePath, runId: 'safe-run' });
  const runtime = new ReporterRuntime({ sinks: [new LegacyQReportSink(manager), event => events.push(event)] });
  const evidenceStore = {
    save: input => ({
      kind: input.kind,
      name: input.name,
      mimeType: input.mimeType,
      path: 'evidence.txt',
      relativePath: 'media-bucket/evidence/evidence.txt'
    })
  };
  const adapter = new WdioCucumberAdapter({
    runtime,
    evidenceStore,
    capture: 'never',
    redaction: { values: [secret] }
  });
  const sensitiveWorld = {
    pickle: { id: 'scenario-1', name: `login with ${secret}`, tags: [{ name: '@credentials' }] },
    gherkinDocument: { feature: { name: 'Login' } }
  };
  const sensitiveStep = { id: 'step-1', text: `I enter password ${secret}`, keyword: 'When ' };

  await adapter.beforeFeature('login.feature', { name: 'Login' });
  await adapter.beforeScenario(sensitiveWorld);
  await adapter.beforeStep(sensitiveStep, sensitiveWorld.pickle);
  await adapter.attachEvidence('request body', { name: `request ${secret}`, mimeType: 'text/plain' });
  await adapter.afterStep(sensitiveStep, sensitiveWorld.pickle, { passed: false, error: new Error(`step ${secret}`) });
  await adapter.afterScenario(sensitiveWorld, { passed: false, error: `scenario ${secret}` });

  const serialized = JSON.stringify({ events, report: manager.getAllData() });
  assert.doesNotMatch(serialized, new RegExp(secret));
  assert.match(serialized, /\[REDACTED\]/);

  const output = path.join(path.dirname(paths.filePath), 'report.html');
  buildReport({ output, data: { 'Current cycle': manager.getAllData() } });
  assert.doesNotMatch(fs.readFileSync(output, 'utf8'), new RegExp(secret));
});

test('strict redaction stops configured secret labels before dispatching an event', async () => {
  const secret = 'do-not-report-me';
  const events = [];
  const runtime = new ReporterRuntime({ sinks: [event => events.push(event)] });
  const adapter = new WdioCucumberAdapter({ runtime, capture: 'never', redaction: { values: [secret], strict: true } });

  await assert.rejects(
    () => adapter.beforeScenario({ pickle: { name: `outline value ${secret}` } }),
    /sensitive data detected in scenario name/
  );
  assert.deepEqual(events, []);
});

test('redacts common credential and Bearer forms without configuration', async () => {
  const events = [];
  const runtime = new ReporterRuntime({ sinks: [event => events.push(event)] });
  const adapter = new WdioCucumberAdapter({ runtime, capture: 'never' });

  await adapter.beforeScenario({ pickle: { id: 's', name: 'password=default-secret' } });
  await adapter.beforeStep({ id: 'st', text: 'Authorization: Bearer default-token' }, { id: 's', name: 'password=default-secret' });

  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, /default-secret|default-token/);
  assert.match(serialized, /\[REDACTED\]/);
});
