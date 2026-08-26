export const REPORTER_EVENT_VERSION = '1.0';

export const ReporterEventType = Object.freeze({
  RUN_START: 'run:start',
  RUN_END: 'run:end',
  FEATURE_START: 'feature:start',
  FEATURE_END: 'feature:end',
  SCENARIO_START: 'scenario:start',
  SCENARIO_END: 'scenario:end',
  STEP_START: 'step:start',
  STEP_END: 'step:end',
  EVIDENCE: 'evidence'
});

const eventTypes = new Set(Object.values(ReporterEventType));
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class ReporterRuntime {
  constructor(options = {}) {
    this.source = options.source || 'custom-adapter';
    this.clock = options.clock || (() => new Date());
    this.sequence = 0;
    this.sinks = [];
    for (const sink of options.sinks || []) this.use(sink);
  }

  use(sink) {
    const normalized = typeof sink === 'function' ? { handle: sink } : sink;
    if (!normalized || typeof normalized.handle !== 'function') {
      throw new TypeError('reporter sink must be a function or expose handle(event)');
    }
    this.sinks.push(normalized);
    return this;
  }

  async emit(type, payload = {}) {
    if (!eventTypes.has(type)) throw new TypeError(`unsupported reporter event type: ${type}`);
    if (!isObject(payload)) throw new TypeError('reporter event payload must be an object');

    const timestamp = new Date(this.clock());
    if (Number.isNaN(timestamp.getTime())) throw new TypeError('reporter clock returned an invalid date');

    const event = Object.freeze({
      version: REPORTER_EVENT_VERSION,
      sequence: ++this.sequence,
      type,
      source: this.source,
      timestamp: timestamp.toISOString(),
      payload: structuredClone(payload)
    });

    for (const sink of this.sinks) await sink.handle(event);
    return event;
  }
}

export function assertReporterAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('adapter must be an object');
  if (!adapter.name || typeof adapter.name !== 'string') throw new TypeError('adapter.name is required');
  if (!adapter.hooks || typeof adapter.hooks !== 'object') throw new TypeError('adapter.hooks is required');
  return adapter;
}
