import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildReport } from '../src/index.js';
import { loadLegacyDirectory } from '../src/report/build-report.js';

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qkta-report-'));
const reportData = (project = 'demo', status = 'PASSED', started = '2026-01-01T00:00:00.000Z') => ({
  run: {
    execution_summary: { project_name: project, global_start_time: started },
    suite: { test: { test_summary: { status, duration_seconds: 1 } } }
  }
});

test('returns an empty legacy set when report directory does not exist', () => {
  assert.deepEqual(loadLegacyDirectory(path.join(tempDir(), 'missing')), {});
});

test('loads current and historical report files and skips unrelated files', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'current.json'), JSON.stringify(reportData('current', 'PASSED', '2026-01-03T00:00:00Z')));
  fs.writeFileSync(path.join(dir, 'rep_old.json'), JSON.stringify(reportData('old', 'FAILED', '2026-01-01T00:00:00Z')));
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignore me');

  const loaded = loadLegacyDirectory(dir);

  assert.deepEqual(Object.keys(loaded), ['Current cycle', 'rep_old']);
  assert.equal(loaded['Current cycle'].run.execution_summary.project_name, 'current');
});

test('skips malformed report JSON without losing valid reports', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'current.json'), JSON.stringify(reportData()));
  fs.writeFileSync(path.join(dir, 'rep_bad.json'), '{bad');

  const loaded = loadLegacyDirectory(dir);

  assert.deepEqual(Object.keys(loaded), ['Current cycle']);
});

test('builds a self-contained HTML report', () => {
  const dir = tempDir();
  const output = path.join(dir, 'nested', 'report.html');
  const result = buildReport({ output, data: { current: reportData() } });
  const html = fs.readFileSync(output, 'utf8');

  assert.equal(result.summary.passed, 1);
  assert.equal(result.summary.failed, 0);
  assert.match(html, /QKTestAnalytics/);
  assert.match(html, /application\/json/);
  assert.match(html, /Framework-agnostic test analytics/);
});

test('accepts a normalized model without legacy conversion', () => {
  const dir = tempDir();
  const output = path.join(dir, 'report.html');
  const normalized = {
    schemaVersion: '1.0',
    generatedAt: '2026-01-01T00:00:00Z',
    executions: [{ id: 'run', cycle: 'cycle', project: 'demo', tests: [{ name: 'x', suite: 's', status: 'FAILED', durationMs: 4 }] }]
  };

  const result = buildReport({ output, normalized });

  assert.equal(result.model, normalized);
  assert.equal(result.summary.failed, 1);
});

test('escapes HTML metadata and prevents script-tag breakout from embedded JSON', () => {
  const dir = tempDir();
  const output = path.join(dir, 'report.html');
  const normalized = {
    schemaVersion: '<unsafe>',
    generatedAt: '<generated>',
    executions: [{
      id: 'run',
      cycle: 'cycle',
      project: '</script><script>alert(1)</script>',
      tests: [{ name: '<case>', suite: '<suite>', status: 'FAILED', durationMs: 1, steps: [] }]
    }]
  };

  buildReport({ output, normalized });
  const html = fs.readFileSync(output, 'utf8');

  assert.match(html, /schema &lt;unsafe&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /\\u003c\/script>/);
});
