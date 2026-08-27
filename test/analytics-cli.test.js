import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cli = path.resolve('bin/qkta.js');
const run = (args, cwd) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });

const execution = (start, seconds) => ({
  run: {
    execution_summary: {
      project_name: 'cli-fixture',
      global_start_time: start,
      global_time_seconds: seconds
    },
    Checkout: {
      pay: {
        test_summary: { status: 'PASSED', duration_seconds: seconds, browser: 'chrome' }
      }
    }
  }
});

const workspace = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qkta-analytics-cli-'));
  const reports = path.join(root, 'reports');
  fs.mkdirSync(reports, { recursive: true });
  fs.writeFileSync(path.join(reports, 'rep_old.json'), JSON.stringify(execution('2026-08-20T10:00:00Z', 1)));
  fs.writeFileSync(path.join(reports, 'current.json'), JSON.stringify(execution('2026-08-21T10:00:00Z', 1.5)));
  return { root, reports };
};

test('analyze command exports machine-readable historical analytics JSON', () => {
  const { root, reports } = workspace();
  const output = path.join(root, 'analytics.json');
  const result = run(['analyze', '--input', reports, '--output', output], root);
  assert.equal(result.status, 0, result.stderr);
  const analytics = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(analytics.summary.executions, 2);
  assert.equal(analytics.summary.uniqueTests, 1);
  assert.equal(analytics.tests[0].duration.trend.length, 2);
});

test('compare command selects cycle refs and exports comparison JSON', () => {
  const { root, reports } = workspace();
  const output = path.join(root, 'comparison.json');
  const result = run([
    'compare', '--input', reports, '--base', 'rep_old', '--head', 'Current cycle', '--output', output
  ], root);
  assert.equal(result.status, 0, result.stderr);
  const comparison = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(comparison.base.cycle, 'rep_old');
  assert.equal(comparison.head.cycle, 'Current cycle');
  assert.equal(comparison.durationRegressions.length, 1);
});

test('compare command fails clearly when selectors are missing or unknown', () => {
  const { root, reports } = workspace();
  assert.equal(run(['compare', '--input', reports], root).status, 1);
  const missing = run(['compare', '--input', reports, '--base', 'missing', '--head', 'Current cycle'], root);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /could not find base execution/);
});
