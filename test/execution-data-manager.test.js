import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ExecutionDataManager } from '../src/core/execution-data-manager.js';

const tempFile = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qkta-data-'));
  return { root, file: path.join(root, 'reports', 'current.json') };
};

test('creates storage and saves nested data', () => {
  const { file } = tempFile();
  const manager = new ExecutionDataManager({ filePath: file });
  manager.saveData('Checkout.pay.test_summary.status', 'PASSED');
  assert.equal(manager.getDataFromPath('Checkout.pay.test_summary.status'), 'PASSED');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).Checkout.pay.test_summary.status, 'PASSED');
});

test('preserves existing report content when adding values', () => {
  const { file } = tempFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ existing: { value: 1 } }));
  const manager = new ExecutionDataManager({ filePath: file });
  manager.saveData('new.value', 2);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(data.existing.value, 1);
  assert.equal(data.new.value, 2);
});

test('prefixes routes with an explicit run id', () => {
  const { file } = tempFile();
  const manager = new ExecutionDataManager({ filePath: file, runId: 'worker-1' });
  manager.saveData('Checkout.pay.status', 'PASSED');
  assert.equal(manager.getDataFromPath('worker-1.Checkout.pay.status'), 'PASSED');
});

test('rejects empty data routes', () => {
  const { file } = tempFile();
  const manager = new ExecutionDataManager({ filePath: file });
  assert.throws(() => manager.saveData('', 'value'), /route/);
});

test('records deterministic execution lifecycle timing and metadata', () => {
  const { file } = tempFile();
  const times = ['2026-01-01T00:00:00.000Z', '2026-01-01T00:00:02.500Z'];
  const manager = new ExecutionDataManager({ filePath: file, now: () => times.shift() });

  manager.recordStart({ projectName: 'demo', framework: 'wdio' });
  manager.recordEnd();

  const summary = manager.getDataFromPath('execution_summary');
  assert.equal(summary.project_name, 'demo');
  assert.equal(summary.framework, 'wdio');
  assert.equal(summary.global_start_time, '2026-01-01T00:00:00.000Z');
  assert.equal(summary.global_end_time, '2026-01-01T00:00:02.500Z');
  assert.equal(summary.global_time_seconds, 2.5);
});

test('default lifecycle metadata reads the host package and clock', () => {
  const { file } = tempFile();
  const manager = new ExecutionDataManager({ filePath: file });

  manager.recordStart();

  const summary = manager.getDataFromPath('execution_summary');
  assert.equal(summary.project_name, '@qacg/qk-test-analytics');
  assert.match(summary.global_start_time, /^\d{4}-\d{2}-\d{2}T/);
});

test('records deterministic module timing and removes completed timer', () => {
  const { file } = tempFile();
  const times = ['2026-01-01T00:00:00.000Z', '2026-01-01T00:00:01.250Z'];
  const manager = new ExecutionDataManager({ filePath: file, now: () => times.shift() });

  manager.startModule('Login.case');
  manager.endModule('Login.case');

  assert.equal(manager.getDataFromPath('Login.case.test_summary.duration_seconds'), 1.25);
  assert.equal(manager.moduleTimers.size, 0);
});

test('ending a missing lifecycle timer is a no-op', () => {
  const { file } = tempFile();
  const manager = new ExecutionDataManager({ filePath: file });
  manager.endModule('missing');
  assert.equal(manager.getDataFromPath('missing'), undefined);
});

test('archives the current report with an injectable id', () => {
  const { file } = tempFile();
  const manager = new ExecutionDataManager({ filePath: file, archiveId: () => 'fixed' });
  manager.saveData('value', 1);
  const archived = manager.archiveCurrentReport();
  assert.equal(path.basename(archived), 'rep_fixed.json');
  assert.equal(JSON.parse(fs.readFileSync(archived, 'utf8')).value, 1);
  assert.equal(fs.existsSync(file), false);
});

test('default archive id creates a unique report name', () => {
  const { file } = tempFile();
  const manager = new ExecutionDataManager({ filePath: file });
  manager.saveData('value', 1);
  const archived = manager.archiveCurrentReport();
  assert.match(path.basename(archived), /^rep_[0-9a-f-]+\.json$/i);
});

test('archive returns null when no current report exists', () => {
  const { file } = tempFile();
  const manager = new ExecutionDataManager({ filePath: file });
  assert.equal(manager.archiveCurrentReport(), null);
});

test('clear resets persisted data and in-memory lifecycle state', () => {
  const { file } = tempFile();
  const manager = new ExecutionDataManager({ filePath: file });
  manager.saveData('value', 1);
  manager.executionStart = new Date();
  manager.moduleTimers.set('module', new Date());

  manager.clearData();

  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {});
  assert.equal(manager.executionStart, null);
  assert.equal(manager.moduleTimers.size, 0);
});

test('surfaces malformed JSON instead of silently discarding results', () => {
  const { file } = tempFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{invalid');
  const manager = new ExecutionDataManager({ filePath: file });
  assert.throws(() => manager.getDataFromPath('value'), SyntaxError);
});
