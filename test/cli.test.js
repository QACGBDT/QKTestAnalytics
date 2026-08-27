import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('../bin/qkta.js', import.meta.url));
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qkta-cli-'));
const runCli = (args, cwd = tempDir()) => spawnSync(process.execPath, [cli, ...args], {
  cwd,
  encoding: 'utf8'
});

const legacy = {
  run: {
    execution_summary: { project_name: 'demo' },
    suite: { test: { test_summary: { status: 'PASSED' } } }
  }
};

test('prints help with a successful exit', () => {
  const result = runCli(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /qkta build/);
});

test('rejects unknown commands', () => {
  const result = runCli(['does-not-exist']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command/);
});

test('build command generates a report at requested paths', () => {
  const cwd = tempDir();
  const reports = path.join(cwd, 'reports');
  const output = path.join(cwd, 'site', 'index.html');
  fs.mkdirSync(reports);
  fs.writeFileSync(path.join(reports, 'current.json'), `${JSON.stringify(legacy)}\n`);

  const result = runCli(['build', '--input', reports, '--output', output], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(output), true);
  assert.match(result.stdout, /Report generated/);
});

test('clean command archives an existing current report', () => {
  const cwd = tempDir();
  const current = path.join(cwd, 'reports', 'current.json');
  fs.mkdirSync(path.dirname(current));
  fs.writeFileSync(current, '{}\n');

  const result = runCli(['clean', '--input', current], cwd);
  const archived = fs.readdirSync(path.dirname(current)).filter(name => /^rep_.+\.json$/.test(name));

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(current), false);
  assert.equal(archived.length, 1);
  assert.match(result.stdout, /Archived:/);
});

test('clean command is successful when there is nothing to archive', () => {
  const result = runCli(['clean', '--input', path.join(tempDir(), 'missing.json')]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Nothing to archive/);
});

test('cycle requires a child command', () => {
  const result = runCli(['cycle', '--continue']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: qkta cycle/);
});

test('cycle propagates a successful child exit code', () => {
  const result = runCli(['cycle', '--continue', '--', process.execPath, '-e', 'process.exit(0)']);
  assert.equal(result.status, 0, result.stderr);
});

test('cycle propagates a failing child exit code', () => {
  const result = runCli(['cycle', '--continue', '--', process.execPath, '-e', 'process.exit(7)']);
  assert.equal(result.status, 7);
});

test('new cycle archives default current results before running', () => {
  const cwd = tempDir();
  const reports = path.join(cwd, 'qreport-results', 'media-bucket', 'reports');
  fs.mkdirSync(reports, { recursive: true });
  fs.writeFileSync(path.join(reports, 'current.json'), '{}\n');

  const result = runCli(['cycle', '--new', '--', process.execPath, '-e', 'process.exit(0)'], cwd);
  const archived = fs.readdirSync(reports).filter(name => /^rep_.+\.json$/.test(name));

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(reports, 'current.json')), false);
  assert.equal(archived.length, 1);
});
