#!/usr/bin/env node
import { spawn } from 'node:child_process';
import {
  ExecutionDataManager,
  GATE_EXIT_CODE,
  buildAnalytics,
  buildQualityGate,
  buildReport,
  compareReportExecutions,
  formatGateSummary,
  loadLegacyDirectory,
  normalizeLegacyReport,
  writeGateSummary,
  writeJsonArtifact
} from '../src/index.js';

const args = process.argv.slice(2);
const invoked = process.argv[1]?.split(/[\\/]/).pop() || 'qkta';
const aliasBuild = invoked === 'qreport-build';
const aliasCycle = invoked === 'qreport-cycle';
const command = aliasBuild ? 'build' : aliasCycle ? 'cycle' : (args.shift() || 'help');

const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const numberValue = (name, fallback) => {
  const parsed = Number(value(name, fallback));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const analyticsOptions = () => ({
  baselineWindow: numberValue('--baseline-window', 5),
  minBaselineSamples: numberValue('--min-baseline-samples', 2),
  durationRegressionPercent: numberValue('--regression-percent', 20),
  durationRegressionMinMs: numberValue('--regression-min-ms', 100),
  slowLimit: numberValue('--slow-limit', 10)
});
const gateOptions = () => ({
  ...analyticsOptions(),
  minPassRate: value('--min-pass-rate', 100),
  maxFailures: value('--max-failures', 0),
  maxFlakyRate: value('--max-flaky-rate', 0),
  maxDurationRegressions: value('--max-duration-regressions', 0),
  selector: value('--target', value('--head', null))
});
const loadModel = reportsDir => normalizeLegacyReport(loadLegacyDirectory(reportsDir));

const printHelp = () => {
  console.log([
    'QKTestAnalytics',
    '',
    'Usage:',
    '  qkta build [--input DIR] [--output FILE]',
    '  qkta analyze [--input DIR] [--output FILE] [analytics thresholds]',
    '  qkta compare --base REF --head REF [--input DIR] [--output FILE] [analytics thresholds]',
    '  qkta gate [--target REF] [--input DIR] [--output FILE] [--summary FILE] [gate thresholds]',
    '  qkta clean [--input FILE]',
    '  qkta cycle [--new|--continue] -- <command> [args...]',
    '',
    'Quality-gate thresholds:',
    '  --min-pass-rate N             Minimum pass rate percent (default: 100)',
    '  --max-failures N              Maximum final failures (default: 0)',
    '  --max-flaky-rate N            Maximum flaky rate percent (default: 0)',
    '  --max-duration-regressions N  Maximum regressed tests (default: 0)',
    '',
    'Analytics thresholds:',
    '  --baseline-window N       Previous successful samples (default: 5)',
    '  --min-baseline-samples N  Minimum historical samples (default: 2)',
    '  --regression-percent N    Minimum relative increase (default: 20)',
    '  --regression-min-ms N     Minimum absolute increase (default: 100)',
    '  --slow-limit N            Slow-test ranking size (default: 10)',
    '',
    'Gate exit codes: 0=pass, 1=usage/data/config error, 2=quality-gate violation.',
    'REF may be an execution id, cycle, branch, commit or project; the latest match is selected.',
    'Legacy aliases: qreport-build, qreport-cycle'
  ].join('\n'));
};

if (command === 'build') {
  const result = buildReport({
    reportsDir: value('--input', 'qreport-results/media-bucket/reports'),
    output: value('--output', 'qreport-results/index.html')
  });
  console.log(`[QKTestAnalytics] Report generated: ${result.output}`);
} else if (command === 'analyze') {
  const input = value('--input', 'qreport-results/media-bucket/reports');
  const output = value('--output', 'qreport-results/analytics.json');
  const analytics = buildAnalytics(loadModel(input), analyticsOptions());
  writeJsonArtifact(analytics, output);
  console.log(`[QKTestAnalytics] Analytics generated: ${output}`);
} else if (command === 'compare') {
  const base = value('--base', null);
  const head = value('--head', null);
  if (!base || !head) {
    console.error('Usage: qkta compare --base REF --head REF [--input DIR] [--output FILE]');
    process.exitCode = 1;
  } else {
    try {
      const input = value('--input', 'qreport-results/media-bucket/reports');
      const output = value('--output', 'qreport-results/comparison.json');
      const comparison = compareReportExecutions(loadModel(input), base, head, analyticsOptions());
      writeJsonArtifact(comparison, output);
      console.log(`[QKTestAnalytics] Comparison generated: ${output}`);
    } catch (error) {
      console.error(`[QKTestAnalytics] ${error.message}`);
      process.exitCode = 1;
    }
  }
} else if (command === 'gate') {
  try {
    const input = value('--input', 'qreport-results/media-bucket/reports');
    const output = value('--output', 'qreport-results/gate.json');
    const summaryOutput = value('--summary', null);
    const gate = buildQualityGate(loadModel(input), gateOptions());
    writeJsonArtifact(gate, output);
    if (summaryOutput) writeGateSummary(gate, summaryOutput);
    console.log(formatGateSummary(gate));
    console.log(`[QKTestAnalytics] Gate JSON: ${output}`);
    if (summaryOutput) console.log(`[QKTestAnalytics] Gate summary: ${summaryOutput}`);
    process.exitCode = gate.passed ? GATE_EXIT_CODE.PASS : GATE_EXIT_CODE.VIOLATION;
  } catch (error) {
    console.error(`[QKTestAnalytics] ${error.message}`);
    process.exitCode = GATE_EXIT_CODE.ERROR;
  }
} else if (command === 'clean') {
  const manager = new ExecutionDataManager({
    filePath: value('--input', 'qreport-results/media-bucket/reports/current.json')
  });
  const archived = manager.archiveCurrentReport();
  console.log(archived ? `[QKTestAnalytics] Archived: ${archived}` : '[QKTestAnalytics] Nothing to archive.');
} else if (command === 'cycle') {
  const isNew = args.includes('--new');
  const separator = args.indexOf('--');
  const childArgs = separator >= 0
    ? args.slice(separator + 1)
    : args.filter(argument => argument !== '--new' && argument !== '--continue');

  if (!childArgs.length) {
    console.error('Usage: qkta cycle [--new|--continue] -- <command> [args...]');
    process.exit(1);
  }

  if (isNew) new ExecutionDataManager().archiveCurrentReport();
  const [childCommand, ...rest] = childArgs;
  const child = spawn(childCommand, rest, { stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('error', error => {
    console.error(`[QKTestAnalytics] Could not start child command: ${error.message}`);
    process.exit(1);
  });
  child.on('exit', code => process.exit(code ?? 1));
} else if (['help', '--help', '-h'].includes(command)) {
  printHelp();
} else {
  console.error(`[QKTestAnalytics] Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}
