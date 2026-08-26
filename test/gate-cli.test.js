import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cli = path.resolve('bin/qkta.js');
const run = (args, cwd) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });

const execution = (start, payStatus, paySeconds, healthStatus) => ({
  run: {
    execution_summary: {
      project_name: 'gate-fixture',
      global_start_time: start,
      global_time_seconds: paySeconds + 0.5
    },
    Checkout: {
      pay: {
        test_summary: { status: payStatus, duration_seconds: paySeconds, browser: 'chrome' }
      }
    },
    API: {
      health: {
        test_summary: {
          status: healthStatus,
          duration_seconds: 0.5,
          browser: 'chrome',
          error: healthStatus === 'FAILED' ? 'TimeoutError: backend unavailable' : null
        }
      }
    }
  }
});

const workspace = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qkta-gate-cli-'));
  const reports = path.join(root, 'reports');
  fs.mkdirSync(reports, { recursive: true });
  fs.writeFileSync(path.join(reports, 'rep_one.json'), JSON.stringify(execution('2026-08-20T10:00:00Z', 'PASSED', 1, 'PASSED')));
  fs.writeFileSync(path.join(reports, 'rep_two.json'), JSON.stringify(execution('2026-08-21T10:00:00Z', 'PASSED', 1.1, 'PASSED')));
  fs.writeFileSync(path.join(reports, 'current.json'), JSON.stringify(execution('2026-08-22T10:00:00Z', 'PASSED', 1.5, 'FAILED')));
  return { root, reports };
};

test('gate command returns exit 2 and still writes JSON and markdown on quality violations', () => {
  const { root, reports } = workspace();
  const output = path.join(root, 'gate.json');
  const summary = path.join(root, 'gate.md');
  const result = run(['gate', '--input', reports, '--output', output, '--summary', summary], root);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /Quality Gate: FAIL/);
  const gate = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(gate.passed, false);
  assert.deepEqual(gate.metrics, {
    tests: 2,
    passed: 1,
    failures: 1,
    skipped: 0,
    other: 0,
    passRate: 50,
    flakyTests: 1,
    flakyRate: 50,
    durationRegressions: 1
  });
  assert.match(fs.readFileSync(summary, 'utf8'), /❌ FAIL/);
});

test('gate command passes at exact configured threshold boundaries', () => {
  const { root, reports } = workspace();
  const output = path.join(root, 'gate.json');
  const result = run([
    'gate', '--input', reports, '--output', output,
    '--min-pass-rate', '50',
    '--max-failures', '1',
    '--max-flaky-rate', '50',
    '--max-duration-regressions', '1'
  ], root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Quality Gate: PASS/);
  assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).passed, true);
});

test('gate command distinguishes invalid configuration and missing targets from quality failures', () => {
  const { root, reports } = workspace();
  const invalid = run(['gate', '--input', reports, '--min-pass-rate', 'nope'], root);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /minPassRate/);
  const missing = run(['gate', '--input', reports, '--target', 'missing'], root);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /could not find target execution/);
});
