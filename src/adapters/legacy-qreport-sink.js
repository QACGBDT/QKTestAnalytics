import { ReporterEventType } from './sdk.js';

const safeSegment = value => String(value || 'unnamed')
  .replaceAll('.', '․')
  .replace(/[\r\n]+/g, ' ')
  .trim() || 'unnamed';

const seconds = milliseconds => Number.isFinite(Number(milliseconds))
  ? Math.max(0, Number(milliseconds)) / 1000
  : 0;

export class LegacyQReportSink {
  constructor(manager) {
    if (!manager || typeof manager.saveData !== 'function') {
      throw new TypeError('LegacyQReportSink requires an ExecutionDataManager-compatible manager');
    }
    this.manager = manager;
    this.scenarios = new Map();
    this.steps = new Map();
  }

  async handle(event) {
    const payload = event.payload;
    switch (event.type) {
      case ReporterEventType.RUN_START:
        this.#saveRunStart(event, payload);
        break;
      case ReporterEventType.RUN_END:
        this.#saveRunEnd(event, payload);
        break;
      case ReporterEventType.SCENARIO_START:
        this.#saveScenarioStart(event, payload);
        break;
      case ReporterEventType.STEP_START:
        this.#saveStepStart(payload);
        break;
      case ReporterEventType.STEP_END:
        this.#saveStepEnd(payload);
        break;
      case ReporterEventType.EVIDENCE:
        this.#saveEvidence(payload);
        break;
      case ReporterEventType.SCENARIO_END:
        this.#saveScenarioEnd(event, payload);
        break;
      default:
        break;
    }
  }

  #saveRunStart(event, payload) {
    this.manager.saveData('execution_summary.global_start_time', event.timestamp);
    if (payload.projectName) this.manager.saveData('execution_summary.project_name', payload.projectName);
    if (payload.framework) this.manager.saveData('execution_summary.framework', payload.framework);
    if (payload.browser) this.manager.saveData('execution_summary.browser', payload.browser);
    if (payload.specs?.length) this.manager.saveData('execution_summary.specs', payload.specs);
  }

  #saveRunEnd(event, payload) {
    this.manager.saveData('execution_summary.global_end_time', event.timestamp);
    if (payload.durationMs !== undefined) {
      this.manager.saveData('execution_summary.global_time_seconds', seconds(payload.durationMs));
    }
    if (payload.exitCode !== undefined) this.manager.saveData('execution_summary.exit_code', payload.exitCode);
  }

  #saveScenarioStart(event, payload) {
    const scenarioId = payload.scenarioId || payload.id || payload.name;
    if (!scenarioId) throw new TypeError('scenario:start requires scenarioId or name');
    const featureName = payload.featureName || 'Feature';
    const scenarioName = payload.name || scenarioId;
    const route = `${safeSegment(featureName)}.${safeSegment(scenarioName)}`;
    this.scenarios.set(String(scenarioId), { route, steps: new Map() });
    this.manager.saveData(`${route}.test_summary.start_time`, event.timestamp);
    this.manager.saveData(`${route}.test_summary.name`, scenarioName);
    this.manager.saveData(`${route}.test_summary.feature`, featureName);
    if (payload.browser) this.manager.saveData(`${route}.test_summary.browser`, payload.browser);
    if (payload.tags?.length) this.manager.saveData(`${route}.test_summary.tags`, payload.tags);
  }

  #saveStepStart(payload) {
    const scenario = this.#scenario(payload.scenarioId);
    const stepId = payload.stepId || payload.id || payload.name;
    if (!stepId) throw new TypeError('step:start requires stepId or name');
    const key = this.#uniqueStepKey(scenario, payload.name || stepId);
    scenario.steps.set(String(stepId), key);
    this.steps.set(`${payload.scenarioId}:${stepId}`, { scenario, key });
    if (payload.keyword) this.manager.saveData(`${scenario.route}.${key}.keyword`, payload.keyword);
  }

  #saveStepEnd(payload) {
    const { scenario, key } = this.#step(payload);
    this.manager.saveData(`${scenario.route}.${key}.status`, payload.status || 'UNKNOWN');
    if (payload.error) this.manager.saveData(`${scenario.route}.${key}.error`, payload.error);
    if (payload.durationMs !== undefined) {
      this.manager.saveData(`${scenario.route}.${key}.duration_seconds`, seconds(payload.durationMs));
    }
  }

  #saveEvidence(payload) {
    const { scenario, key } = this.#step(payload);
    const artifact = payload.artifact || {};
    if (artifact.kind === 'screenshot' && artifact.path) {
      this.manager.saveData(`${scenario.route}.${key}.screenshot_path`, artifact.path);
    }
    const route = `${scenario.route}.${key}.evidence`;
    let current;
    try {
      current = this.manager.getDataFromPath(route);
    } catch {
      current = undefined;
    }
    const evidence = Array.isArray(current) ? current : [];
    evidence.push({
      kind: artifact.kind || 'attachment',
      name: artifact.name || null,
      mimeType: artifact.mimeType || null,
      path: artifact.relativePath || artifact.path || null,
      size: artifact.size ?? null
    });
    this.manager.saveData(route, evidence);
  }

  #saveScenarioEnd(event, payload) {
    const scenario = this.#scenario(payload.scenarioId);
    this.manager.saveData(`${scenario.route}.test_summary.end_time`, event.timestamp);
    this.manager.saveData(`${scenario.route}.test_summary.status`, payload.status || 'UNKNOWN');
    if (payload.error) this.manager.saveData(`${scenario.route}.test_summary.error`, payload.error);
    if (payload.durationMs !== undefined) {
      this.manager.saveData(`${scenario.route}.test_summary.duration_seconds`, seconds(payload.durationMs));
    }
  }

  #scenario(id) {
    const scenario = this.scenarios.get(String(id));
    if (!scenario) throw new Error(`unknown scenario: ${id}`);
    return scenario;
  }

  #step(payload) {
    const step = this.steps.get(`${payload.scenarioId}:${payload.stepId}`);
    if (!step) throw new Error(`unknown step: ${payload.stepId}`);
    return step;
  }

  #uniqueStepKey(scenario, name) {
    const base = safeSegment(name);
    const existing = new Set(scenario.steps.values());
    if (!existing.has(base)) return base;
    let index = 2;
    while (existing.has(`${base} [${index}]`)) index++;
    return `${base} [${index}]`;
  }
}
