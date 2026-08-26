export { ExecutionDataManager } from './core/execution-data-manager.js';
export type { ExecutionDataManagerOptions, ExecutionStartMetadata } from './core/execution-data-manager.js';
export { buildReport, loadLegacyDirectory } from './report/build-report.js';
export type { BuildReportOptions, BuildReportResult } from './report/build-report.js';
export { normalizeLegacyReport, summarizeExecutions, SCHEMA_VERSION } from './core/model.js';
export type {
  ExecutionSummary,
  NormalizedExecution,
  NormalizedReport,
  NormalizedStep,
  NormalizedTest
} from './core/model.js';
export * from './adapters/index.js';
