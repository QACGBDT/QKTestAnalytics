export {
  ANALYTICS_VERSION,
  DEFAULT_ANALYTICS_OPTIONS,
  buildAnalytics,
  detectDurationRegression,
  executionReference,
  median,
  percentile,
  resolveAnalyticsOptions
} from './analytics.js';
export { buildTestIdentityKey, createTestIdentity } from './identity.js';
export { fingerprintFailure, normalizeFailure } from './failure.js';
export { compareExecutions, compareReportExecutions, selectExecution } from './compare.js';
export { writeAnalyticsJson, writeComparisonJson, writeJsonArtifact } from './export.js';
export {
  DEFAULT_GATE_OPTIONS,
  GATE_EXIT_CODE,
  GATE_VERSION,
  buildQualityGate,
  formatGateMarkdown,
  formatGateSummary,
  resolveGateOptions,
  writeGateJson,
  writeGateSummary
} from './gate.js';
