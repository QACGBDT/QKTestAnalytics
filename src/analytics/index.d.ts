import type { NormalizedExecution, NormalizedReport, NormalizedTest } from '../core/model.js';

export declare const ANALYTICS_VERSION: '1.0';
export interface AnalyticsOptions {
  baselineWindow?: number;
  minBaselineSamples?: number;
  durationRegressionPercent?: number;
  durationRegressionMinMs?: number;
  slowLimit?: number;
  generatedAt?: string;
}
export interface ResolvedAnalyticsOptions {
  baselineWindow: number;
  minBaselineSamples: number;
  durationRegressionPercent: number;
  durationRegressionMinMs: number;
  slowLimit: number;
}
export declare const DEFAULT_ANALYTICS_OPTIONS: Readonly<ResolvedAnalyticsOptions>;

export interface TestIdentity {
  id: string;
  key: string;
  strategy: 'explicit' | 'derived';
}
export declare function buildTestIdentityKey(test?: NormalizedTest, execution?: NormalizedExecution): string;
export declare function createTestIdentity(test?: NormalizedTest, execution?: NormalizedExecution): TestIdentity;

export interface FailureFingerprint {
  fingerprint: string;
  normalized: string;
  sample: string;
}
export declare function normalizeFailure(error: unknown): string | null;
export declare function fingerprintFailure(error: unknown): FailureFingerprint | null;

export interface ExecutionReference {
  id: string | null;
  cycle: string | null;
  project: string | null;
  branch: string | null;
  commit: string | null;
  startedAt: string | null;
}
export interface DurationRegression {
  regressed: boolean;
  baselineSampleSize: number;
  baselineMedianMs: number;
  currentDurationMs: number;
  deltaMs: number;
  percentDelta: number;
}
export interface DurationTrendPoint {
  execution: ExecutionReference;
  status: string;
  durationMs: number;
  retryCount: number;
  retryFlaky: boolean;
}
export interface TestAnalytics {
  stableId: string;
  identityKey: string;
  identityStrategy: 'explicit' | 'derived';
  name: string;
  suite: string;
  project: string | null;
  classification: 'flaky' | 'failing' | 'stable' | 'skipped' | 'unknown';
  retryFlaky: boolean;
  historyFlaky: boolean;
  executions: number;
  retries: number;
  retryRuns: number;
  statusCounts: Record<string, number>;
  latest: DurationTrendPoint | null;
  duration: {
    samples: number;
    medianMs: number;
    p95Ms: number;
    regression: DurationRegression;
    trend: DurationTrendPoint[];
  };
  failureFingerprints: Array<{ fingerprint: string; normalized: string }>;
}
export interface SlowTest {
  rank: number;
  stableId: string;
  name: string;
  suite: string;
  p95Ms: number;
  medianMs: number;
  latestDurationMs: number;
  latestStatus: string;
}
export interface FailureGroup extends FailureFingerprint {
  occurrences: number;
  testCount: number;
  executionCount: number;
  stableIds: string[];
}
export interface AnalyticsResult {
  analyticsVersion: typeof ANALYTICS_VERSION;
  schemaVersion: string | null;
  generatedAt: string;
  config: ResolvedAnalyticsOptions;
  summary: {
    executions: number;
    uniqueTests: number;
    attempts: number;
    retries: number;
    flakyTests: number;
    flakyRate: number;
    durationRegressions: number;
    failureGroups: number;
  };
  executions: ExecutionReference[];
  tests: TestAnalytics[];
  slowTests: SlowTest[];
  failureGroups: FailureGroup[];
}
export declare function resolveAnalyticsOptions(options?: AnalyticsOptions): ResolvedAnalyticsOptions;
export declare function median(values?: number[]): number;
export declare function percentile(values?: number[], percentileValue?: number): number;
export declare function executionReference(execution?: NormalizedExecution): ExecutionReference;
export declare function detectDurationRegression(trend?: Array<{ status: string; durationMs: number }>, options?: AnalyticsOptions): DurationRegression;
export declare function buildAnalytics(report?: NormalizedReport, options?: AnalyticsOptions): AnalyticsResult;

export type ExecutionSelector = string | Partial<ExecutionReference> | NormalizedExecution;
export interface ComparisonResult {
  analyticsVersion: '1.0';
  base: ExecutionReference;
  head: ExecutionReference;
  config: Pick<ResolvedAnalyticsOptions, 'durationRegressionPercent' | 'durationRegressionMinMs'>;
  summary: Record<string, unknown>;
  added: Array<Record<string, unknown>>;
  removed: Array<Record<string, unknown>>;
  statusRegressions: Array<Record<string, unknown>>;
  statusImprovements: Array<Record<string, unknown>>;
  statusChanges: Array<Record<string, unknown>>;
  durationChanges: Array<Record<string, unknown>>;
  durationRegressions: Array<Record<string, unknown>>;
  newFailureFingerprints: Array<FailureFingerprint & { stableId: string; name: string }>;
  resolvedFailureFingerprints: Array<FailureFingerprint & { stableId: string; name: string }>;
}
export declare function selectExecution(report: NormalizedReport, selector: ExecutionSelector): NormalizedExecution | null;
export declare function compareExecutions(baseExecution: NormalizedExecution, headExecution: NormalizedExecution, options?: AnalyticsOptions): ComparisonResult;
export declare function compareReportExecutions(report: NormalizedReport, baseSelector: ExecutionSelector, headSelector: ExecutionSelector, options?: AnalyticsOptions): ComparisonResult;

export declare function writeJsonArtifact(data: unknown, output: string): string;
export declare function writeAnalyticsJson(report: NormalizedReport, options?: AnalyticsOptions & { output?: string }): { output: string; analytics: AnalyticsResult };
export declare function writeComparisonJson(report: NormalizedReport, baseSelector: ExecutionSelector, headSelector: ExecutionSelector, options?: AnalyticsOptions & { output?: string }): { output: string; comparison: ComparisonResult };

export declare const GATE_VERSION: '1.0';
export declare const GATE_EXIT_CODE: Readonly<{ PASS: 0; ERROR: 1; VIOLATION: 2 }>;
export interface GateThresholdOptions {
  minPassRate?: number;
  maxFailures?: number;
  maxFlakyRate?: number;
  maxDurationRegressions?: number;
}
export interface ResolvedGateOptions {
  minPassRate: number;
  maxFailures: number;
  maxFlakyRate: number;
  maxDurationRegressions: number;
}
export declare const DEFAULT_GATE_OPTIONS: Readonly<ResolvedGateOptions>;
export interface GateMetrics {
  tests: number;
  passed: number;
  failures: number;
  skipped: number;
  other: number;
  passRate: number;
  flakyTests: number;
  flakyRate: number;
  durationRegressions: number;
}
export interface GateViolation {
  rule: 'min-pass-rate' | 'max-failures' | 'max-flaky-rate' | 'max-duration-regressions';
  metric: 'passRate' | 'failures' | 'flakyRate' | 'durationRegressions';
  actual: number;
  operator: '>=' | '<=';
  threshold: number;
  message: string;
}
export interface QualityGateResult {
  gateVersion: typeof GATE_VERSION;
  analyticsVersion: typeof ANALYTICS_VERSION;
  schemaVersion: string | null;
  generatedAt: string;
  passed: boolean;
  exitCode: 0 | 2;
  target: ExecutionReference;
  historyExecutions: number;
  thresholds: ResolvedGateOptions;
  analyticsConfig: ResolvedAnalyticsOptions;
  metrics: GateMetrics;
  violations: GateViolation[];
}
export type QualityGateOptions = AnalyticsOptions & GateThresholdOptions & {
  selector?: ExecutionSelector;
  target?: ExecutionSelector;
  output?: string;
};
export declare function resolveGateOptions(options?: GateThresholdOptions): ResolvedGateOptions;
export declare function buildQualityGate(report?: NormalizedReport, options?: QualityGateOptions): QualityGateResult;
export declare function formatGateSummary(gate: QualityGateResult): string;
export declare function formatGateMarkdown(gate: QualityGateResult): string;
export declare function writeGateJson(report: NormalizedReport, options?: QualityGateOptions): { output: string; gate: QualityGateResult };
export declare function writeGateSummary(gate: QualityGateResult, output: string): string;
