export { ExecutionDataManager } from './core/execution-data-manager.js';
export { buildReport } from './report/build-report.js';
export { normalizeLegacyReport, summarizeExecutions, SCHEMA_VERSION } from './core/model.js';
export {
  FileEvidenceStore,
  LegacyQReportSink,
  REPORTER_EVENT_VERSION,
  ReporterEventType,
  ReporterRuntime,
  WdioCucumberAdapter,
  assertReporterAdapter,
  createWdioCucumberAdapter,
  createWdioCucumberHooks
} from './adapters/index.js';
