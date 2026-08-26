import type { ExecutionSummary, NormalizedReport } from '../core/model.js';

export interface BuildReportOptions {
  reportsDir?: string;
  output?: string;
  data?: Record<string, unknown>;
  normalized?: NormalizedReport;
}

export interface BuildReportResult {
  output: string;
  model: NormalizedReport;
  summary: ExecutionSummary;
}

export declare function loadLegacyDirectory(reportsDir: string): Record<string, unknown>;
export declare function buildReport(options?: BuildReportOptions): BuildReportResult;
