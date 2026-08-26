import fs from 'node:fs';
import path from 'node:path';
import { buildAnalytics } from './analytics.js';
import { compareReportExecutions } from './compare.js';

export function writeJsonArtifact(data, output) {
  if (!output) throw new TypeError('output path is required');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return output;
}

export function writeAnalyticsJson(report, options = {}) {
  const { output = 'qreport-results/analytics.json', ...analyticsOptions } = options;
  const analytics = buildAnalytics(report, analyticsOptions);
  writeJsonArtifact(analytics, output);
  return { output, analytics };
}

export function writeComparisonJson(report, baseSelector, headSelector, options = {}) {
  const { output = 'qreport-results/comparison.json', ...compareOptions } = options;
  const comparison = compareReportExecutions(report, baseSelector, headSelector, compareOptions);
  writeJsonArtifact(comparison, output);
  return { output, comparison };
}
