import { ExecutionDataManager } from '../core/execution-data-manager.js';
import { FileEvidenceStore } from './evidence-store.js';
import { LegacyQReportSink } from './legacy-qreport-sink.js';
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
    this.onEvidenceError = options.onEvidenceError || (() => {});
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
    this.feature = { uri: uri || null, name: feature.name || 'Feature' };
    await this.runtime.emit(ReporterEventType.FEATURE_START, this.feature);
  }

  async afterFeature(uri, feature = {}) {
    await this.runtime.emit(ReporterEventType.FEATURE_END, {
      uri: uri || this.feature?.uri || null,
      name: feature.name || this.feature?.name || 'Feature'
    });
    this.feature = null;
  }

  async beforeScenario(world = {}) {
    const pickle = world.pickle || world.scenario || {};
    const featureName = this.feature?.name || world.gherkinDocument?.feature?.name || 'Feature';
    const name = pickle.name || 'Scenario';
    const scenarioId = String(pickle.id || `${featureName}:${name}`);
    this.scenario = { scenarioId, name, featureName };
    this.scenarioStartedAt = this.now();
    this.stepCounter = 0;

    await this.runtime.emit(ReporterEventType.SCENARIO_START, {
      scenarioId,
      name,
      featureName,
      browser: this.browserName,
      tags: tagsOf(pickle)
    });
  }

  async afterScenario(world = {}, result = {}) {
    const scenario = this.#scenarioFrom(world);
    await this.runtime.emit(ReporterEventType.SCENARIO_END, {
      ...scenario,
      status: statusOf(result),
      error: errorText(result.error),
      durationMs: durationOf(result, this.scenarioStartedAt, this.now)
    });
    this.scenario = null;
    this.step = null;
    this.scenarioStartedAt = null;
    this.stepStartedAt = null;
  }

  async beforeStep(step = {}, scenario = {}) {
    const currentScenario = this.#scenarioFrom({ pickle: scenario });
    const name = step.text || step.name || 'Step';
    const stepId = String(step.id || `${currentScenario.scenarioId}:step:${++this.stepCounter}`);
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
        evidenceError = errorText(error);
        this.onEvidenceError(error);
      }
    }

    await this.runtime.emit(ReporterEventType.STEP_END, {
      ...currentStep,
      status,
      error: errorText(result.error),
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

    const artifact = this.evidenceStore.save({
      content,
      kind: options.kind || 'attachment',
      name: options.name,
      mimeType: options.mimeType,
      encoding: options.encoding,
      extension: options.extension
    });

    await this.runtime.emit(ReporterEventType.EVIDENCE, { scenarioId, stepId, artifact });
    return artifact;
  }

  #shouldCapture(status) {
    return this.capture === 'always' || (this.capture === 'on-failure' && status === 'FAILED');
  }

  #scenarioFrom(world = {}) {
    if (this.scenario) return this.scenario;
    const pickle = world.pickle || {};
    const featureName = this.feature?.name || 'Feature';
    const name = pickle.name || 'Scenario';
    return { scenarioId: String(pickle.id || `${featureName}:${name}`), name, featureName };
  }

  #stepFrom(step, scenario) {
    if (this.step) return this.step;
    const name = step.text || step.name || 'Step';
    return {
      scenarioId: scenario.scenarioId,
      stepId: String(step.id || `${scenario.scenarioId}:step:${++this.stepCounter}`),
      name
    };
  }

  #projectName() {
    return process.env.npm_package_name || process.env.QKTA_PROJECT || 'UNNAMED_PROJECT';
  }
}

export function createWdioCucumberAdapter(options = {}) {
  let runtime = options.runtime;
  let manager = options.manager || null;

  if (!runtime) {
    manager ||= new ExecutionDataManager({
      filePath: options.filePath,
      runId: options.runId
    });
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
    onEvidenceError: options.onEvidenceError
  });

  adapter.manager = manager;
  return assertReporterAdapter(adapter);
}

export function createWdioCucumberHooks(options = {}) {
  return createWdioCucumberAdapter(options).hooks;
}
