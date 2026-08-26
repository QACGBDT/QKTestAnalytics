#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'qkta-package-'));
const consumer = path.join(workspace, 'consumer');
fs.mkdirSync(consumer, { recursive: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options
  });

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}\n${details}`);
  }

  return result;
}

try {
  const packed = run(npm, [
    'pack',
    '--json',
    '--ignore-scripts',
    '--pack-destination',
    workspace
  ], { cwd: process.cwd() });

  const metadata = JSON.parse(packed.stdout);
  const filename = metadata[0]?.filename;
  if (!filename) throw new Error('npm pack did not return a tarball filename');

  const tarball = path.join(workspace, filename);
  fs.writeFileSync(path.join(consumer, 'package.json'), '{"private":true,"type":"module"}\n');

  run(npm, [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--no-save',
    tarball
  ], { cwd: consumer });

  const smokeFile = path.join(consumer, 'smoke.mjs');
  fs.writeFileSync(smokeFile, [
    "import * as api from 'qk-test-analytics';",
    "import { buildReport } from 'qk-test-analytics/reporter';",
    "import { ExecutionDataManager } from 'qk-test-analytics/data';",
    "const required = ['ExecutionDataManager', 'buildReport', 'normalizeLegacyReport', 'summarizeExecutions', 'SCHEMA_VERSION'];",
    "for (const name of required) if (!(name in api)) throw new Error(`Missing export: ${name}`);",
    "if (api.SCHEMA_VERSION !== '1.0') throw new Error('Unexpected schema version');",
    "if (api.buildReport !== buildReport) throw new Error('Reporter subpath export is inconsistent');",
    "if (api.ExecutionDataManager !== ExecutionDataManager) throw new Error('Data subpath export is inconsistent');"
  ].join('\n'), 'utf8');

  run(process.execPath, [smokeFile], { cwd: consumer });

  const installedCli = path.join(
    consumer,
    'node_modules',
    'qk-test-analytics',
    'bin',
    'qkta.js'
  );
  if (!fs.existsSync(installedCli)) throw new Error('Published package is missing the qkta CLI');

  const help = run(process.execPath, [installedCli, '--help'], { cwd: consumer });
  if (!help.stdout.includes('qkta build')) throw new Error('Installed qkta CLI help is invalid');

  console.log('[QKTestAnalytics] Package consumer smoke test passed.');
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}
