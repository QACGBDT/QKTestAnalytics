import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ExecutionDataManager } from '../core/execution-data-manager.js';
import { FileEvidenceStore } from './evidence-store.js';
import { LegacyQReportSink } from './legacy-qreport-sink.js';
import { createReportRedactor } from './redaction.js';
import { ReporterEventType, ReporterRuntime, assertReporterAdapter } from './sdk.js';

const captureModes = new Set(['never', 'on-failure', 'always']);

const errorText = error => {
  if (!error) return null;
  if (typeof error === 'string') return error;
  if (error.stack) return String(error.stack);
  if (error.message) return String(error.message);
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const statusOf = result => {
  if (result?.passed === true) return 'PASSED';
  if (result?.passed === false) return 'FAILED';
  return String(result?.status || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
};

const durationOf = (result, startedAt, now) => {
  const reported = Number(result?.duration);
  if (Number.isFinite(reported) && reported >= 0) return reported;
  return startedAt === null ? 0 : Math.max(0, now() - startedAt);
};

const tagsOf = pickle => (pickle?.tags || []).map(tag => tag?.name).filter(Boolean);
const stableIdentity = (...parts) => `wdio-${crypto.createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 24)}`;

export class WdioCucumberAdapter {
  constructor(options = {}) {
    if (!options.runtime || typeof options.runtime.emit !== 'function') {
      throw new TypeError('WdioCucumberAdapter requires a ReporterRuntime-compatible runtime');
    }
    this.name = 'wdio-cucumber';
    this.runtime = options.runtime;
    this.evidenceStore = options.evidenceStore || new FileEvidenceStore();
    this.capture = options.capture || 'on-failure';
    this.now = options.now || Date.now;
    this.projectName = options.projectName || null;
    this.onEvidenceError = options.onEvidenceError || (() => {});
    this.redactor = createReportRedactor(options.redaction);
    if (!captureModes.has(this.capture)) throw new TypeError(`unsupported evidence capture mode: ${this.capture}`);

    this.session = null;
    this.browserName = null;
    this.feature = null;
    this.scenario = null;
    this.step = null;
    this.runStartedAt = null;
    this.scenarioStartedAt = null;
    this.stepStartedAt = null;
    this.stepCounter = 0;

    this.hooks = Object.freeze({
      before: this.before.bind(this),
      after: this.after.bind(this),
      beforeFeature: this.beforeFeature.bind(this),
      afterFeature: this.afterFeature.bind(this),
      beforeScenario: this.beforeScenario.bind(this),
      afterScenario: this.afterScenario.bind(this),
      beforeStep: this.beforeStep.bind(this),
      afterStep: this.afterStep.bind(this)
    });
  }

  async before(capabilities = {}, specs = [], session = null) {
    this.session = session;
    this.browserName = capabilities.browserName || session?.capabilities?.browserName || null;
    this.runStartedAt = this.now();
    await this.runtime.emit(ReporterEventType.RUN_START, {
      projectName: this.#projectName(),
      framework: 'webdriverio-cucumber',
      browser: this.browserName,
      specs: Array.isArray(specs) ? specs : []
    });
  }

  async after(result) {
    await this.runtime.emit(ReporterEventType.RUN_END, {
      exitCode: typeof result === 'number' ? result : undefined,
      durationMs: this.runStartedAt === null ? 0 : Math.max(0, this.now() - this.runStartedAt)
    });
    this.session = null;
  }

  async beforeFeature(uri, feature = {}) {
    this.feature = { uri: uri || null, name: this.#redact(feature.name || 'Feature', 'feature name') };
    await this.runtime.emit(ReporterEventType.FEATURE_START, this.feature);
  }

  async afterFeature(uri, feature = {}) {
    await this.runtime.emit(ReporterEventType.FEATURE_END, {
      uri: uri || this.feature?.uri || null,
      name: this.#redact(feature.name || this.feature?.name || 'Feature', 'feature name')
    });
    this.feature = null;
  }

  async beforeScenario(world = {}) {
    const pickle = world.pickle || world.scenario || {};
    const rawFeatureName = this.feature?.name || world.gherkinDocument?.feature?.name || 'Feature';
    const rawName = pickle.name || 'Scenario';
    const featureName = this.#redact(rawFeatureName, 'feature name');
    const name = this.#redact(rawName, 'scenario name');
    const scenarioId = stableIdentity('scenario', pickle.id || '', rawFeatureName, rawName);
    this.scenario = { scenarioId, name, featureName };
    this.scenarioStartedAt = this.now();
    this.stepCounter = 0;

    await this.runtime.emit(ReporterEventType.SCENARIO_START, {
      scenarioId,
      name,
      featureName,
      browser: this.browserName,
      tags: tagsOf(pickle).map(tag => this.#redact(tag, 'scenario tag'))
    });
  }

  async afterScenario(world = {}, result = {}) {
    const scenario = this.#scenarioFrom(world);
    await this.runtime.emit(ReporterEventType.SCENARIO_END, {
      ...scenario,
      status: statusOf(result),
      error: this.#redact(errorText(result.error), 'scenario error'),
      durationMs: durationOf(result, this.scenarioStartedAt, this.now)
    });
    this.scenario = null;
    this.step = null;
    this.scenarioStartedAt = null;
    this.stepStartedAt = null;
  }

  async beforeStep(step = {}, scenario = {}) {
    const currentScenario = this.#scenarioFrom({ pickle: scenario });
    const rawName = step.text || step.name || 'Step';
    const name = this.#redact(rawName, 'step name');
    const stepId = stableIdentity('step', step.id || '', currentScenario.scenarioId, rawName, String(++this.stepCounter));
    this.step = { scenarioId: currentScenario.scenarioId, stepId, name };
    this.stepStartedAt = this.now();

    await this.runtime.emit(ReporterEventType.STEP_START, {
      ...this.step,
      keyword: step.keyword || null
    });
  }

  async afterStep(step = {}, scenario = {}, result = {}) {
    const currentScenario = this.#scenarioFrom({ pickle: scenario });
    const currentStep = this.#stepFrom(step, currentScenario);
    const status = statusOf(result);
    let evidenceError = null;

    if (this.#shouldCapture(status)) {
      try {
        await this.captureScreenshot({ scenarioId: currentScenario.scenarioId, stepId: currentStep.stepId });
      } catch (error) {
        evidenceError = this.#redact(errorText(error), 'evidence error');
        this.onEvidenceError(error);
      }
    }

    await this.runtime.emit(ReporterEventType.STEP_END, {
      ...currentStep,
      status,
      error: this.#redact(errorText(result.error), 'step error'),
      durationMs: durationOf(result, this.stepStartedAt, this.now),
      evidenceError
    });
    this.step = null;
    this.stepStartedAt = null;
  }

  async captureScreenshot(target = {}) {
    if (!this.session || typeof this.session.takeScreenshot !== 'function') {
      throw new Error('WebdriverIO session does not expose takeScreenshot()');
    }
    const content = await this.session.takeScreenshot();
    return this.attachEvidence(content, {
      ...target,
      kind: 'screenshot',
      name: 'Screenshot',
      mimeType: 'image/png',
      encoding: 'base64'
    });
  }

  async attachEvidence(content, options = {}) {
    const scenarioId = options.scenarioId || this.scenario?.scenarioId;
    const stepId = options.stepId || this.step?.stepId;
    if (!scenarioId || !stepId) throw new Error('evidence requires an active or explicit scenarioId and stepId');

    const artifact = await this.evidenceStore.save({
      content,
      kind: options.kind || 'attachment',
      name: this.#redact(options.name, 'evidence name'),
      mimeType: options.mimeType,
      encoding: options.encoding,
      extension: options.extension
    });

    const safeArtifact = this.#sanitizeArtifact(artifact);
    await this.runtime.emit(ReporterEventType.EVIDENCE, { scenarioId, stepId, artifact: safeArtifact });
    return safeArtifact;
  }

  #shouldCapture(status) {
    return this.capture === 'always' || (this.capture === 'on-failure' && status === 'FAILED');
  }

  #scenarioFrom(world = {}) {
    if (this.scenario) return this.scenario;
    const pickle = world.pickle || {};
    const rawFeatureName = this.feature?.name || 'Feature';
    const rawName = pickle.name || 'Scenario';
    return {
      scenarioId: stableIdentity('scenario', pickle.id || '', rawFeatureName, rawName),
      name: this.#redact(rawName, 'scenario name'),
      featureName: this.#redact(rawFeatureName, 'feature name')
    };
  }

  #stepFrom(step, scenario) {
    if (this.step) return this.step;
    const rawName = step.text || step.name || 'Step';
    return {
      scenarioId: scenario.scenarioId,
      stepId: stableIdentity('step', step.id || '', scenario.scenarioId, rawName, String(++this.stepCounter)),
      name: this.#redact(rawName, 'step name')
    };
  }

  #redact(value, field) {
    return this.redactor.redact(value, field);
  }

  #sanitizeArtifact(artifact = {}) {
    const output = { ...artifact };
    for (const field of ['name', 'path', 'relativePath']) {
      if (output[field] !== undefined && output[field] !== null) output[field] = this.#redact(output[field], `evidence ${field}`);
    }
    return output;
  }

  #projectName() {
    if (this.projectName) return this.projectName;
    if (process.env.QKTA_PROJECT) return process.env.QKTA_PROJECT;
    if (process.env.npm_package_name) return process.env.npm_package_name;
    try {
      const packagePath = path.resolve(process.cwd(), 'package.json');
      return JSON.parse(fs.readFileSync(packagePath, 'utf8')).name || 'UNNAMED_PROJECT';
    } catch {
      return 'UNNAMED_PROJECT';
    }
  }
}

export function createWdioCucumberAdapter(options = {}) {
  let runtime = options.runtime;
  let manager = options.manager || null;

  if (!runtime) {
    const generatedRunId = `run-${(options.runIdFactory || crypto.randomUUID)()}`;
    const runId = options.runId || process.env.RUN_ID || generatedRunId;
    manager ||= new ExecutionDataManager({
      filePath: options.filePath,
      runId
    });
    if (!manager.runId) manager.runId = runId;
    const sink = options.legacy === false ? null : new LegacyQReportSink(manager);
    runtime = new ReporterRuntime({
      source: 'wdio-cucumber',
      clock: options.clock,
      sinks: sink ? [sink] : []
    });
  }

  const evidenceStore = options.evidenceStore || new FileEvidenceStore({
    rootDir: options.evidenceRoot,
    uuid: options.uuid
  });

  const adapter = new WdioCucumberAdapter({
    runtime,
    evidenceStore,
    capture: options.capture,
    now: options.now,
    projectName: options.projectName,
    onEvidenceError: options.onEvidenceError
  });

  adapter.manager = manager;
  return assertReporterAdapter(adapter);
}

export function createWdioCucumberHooks(options = {}) {
  return createWdioCucumberAdapter(options).hooks;
}
