import fs from 'node:fs';
import path from 'node:path';
import { normalizeLegacyReport, summarizeExecutions } from '../core/model.js';
import { renderHtml } from './template.js';

export function loadLegacyDirectory(reportsDir) {
  if (!fs.existsSync(reportsDir)) return {};
  const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json'));
  const rows = files.map(file => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(reportsDir, file), 'utf8'));
      const first = Object.values(data)[0];
      const started = first?.execution_summary?.global_start_time || '';
      return { file, data, started: Date.parse(started) || 0 };
    } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.started - a.started);
  const combined = {};
  for (const row of rows) combined[row.file === 'current.json' ? 'Current cycle' : row.file.replace(/\.json$/, '')] = row.data;
  return combined;
}

export function buildReport(options = {}) {
  const reportsDir = options.reportsDir || 'qreport-results/media-bucket/reports';
  const output = options.output || 'qreport-results/index.html';
  const legacy = options.data || loadLegacyDirectory(reportsDir);
  const model = options.normalized || normalizeLegacyReport(legacy);
  const summary = summarizeExecutions(model.executions);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, renderHtml(model, summary), 'utf8');
  return { output, model, summary };
}
