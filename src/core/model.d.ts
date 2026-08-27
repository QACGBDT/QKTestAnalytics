export declare const SCHEMA_VERSION: '1.0';

export interface NormalizedStep {
  name: string;
  [key: string]: unknown;
}

export interface NormalizedTest {
  id: string;
  historyId?: string;
  stableId?: string;
  name: string;
  suite: string;
  status: string;
  durationMs: number;
  browser?: string | null;
  error?: unknown;
  video?: string | null;
  parameters?: Record<string, unknown> | unknown[] | null;
  params?: Record<string, unknown> | unknown[] | null;
  attempt?: number;
  retry?: number;
  steps?: NormalizedStep[];
  [key: string]: unknown;
}

export interface NormalizedExecution {
  id: string;
  cycle?: string;
  source?: string;
  project?: string | null;
  branch?: string | null;
  commit?: string | null;
  metadata?: Record<string, any>;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMs?: number;
  tests: NormalizedTest[];
  [key: string]: unknown;
}

export interface NormalizedReport {
  schemaVersion: typeof SCHEMA_VERSION;
  generatedAt: string;
  executions: NormalizedExecution[];
}

export interface ExecutionSummary {
  executions: number;
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  other: number;
  passRate: number;
  durationMs: number;
}

export declare function normalizeLegacyReport(input?: Record<string, unknown>, source?: string): NormalizedReport;
export declare function summarizeExecutions(executions?: NormalizedExecution[]): ExecutionSummary;
