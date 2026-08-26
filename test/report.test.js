import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildReport } from '../src/index.js';

test('builds a self-contained HTML report', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qkta-'));
  const output = path.join(dir, 'report.html');
  const result = buildReport({ output, data: { current: { run: { execution_summary: {}, suite: { test: { test_summary: { status: 'PASSED' } } } } } } });
  const html = fs.readFileSync(output, 'utf8');
  assert.equal(result.summary.passed, 1);
  assert.match(html, /QKTestAnalytics/);
  assert.match(html, /application\/json/);
});
