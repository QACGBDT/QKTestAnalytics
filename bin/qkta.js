#!/usr/bin/env node
import { buildReport, ExecutionDataManager } from '../src/index.js';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const invoked = process.argv[1]?.split(/[\\/]/).pop() || 'qkta';
const aliasBuild = invoked === 'qreport-build';
const aliasCycle = invoked === 'qreport-cycle';
const command = aliasBuild ? 'build' : aliasCycle ? 'cycle' : (args.shift() || 'help');

const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const printHelp = () => {
  console.log('QKTestAnalytics\n\nUsage:\n  qkta build [--input DIR] [--output FILE]\n  qkta clean [--input FILE]\n  qkta cycle [--new|--continue] -- <command> [args...]\n\nLegacy aliases: qreport-build, qreport-cycle');
};

if (command === 'build') {
  const result = buildReport({
    reportsDir: value('--input', 'qreport-results/media-bucket/reports'),
    output: value('--output', 'qreport-results/index.html')
  });
  console.log(`[QKTestAnalytics] Report generated: ${result.output}`);
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
