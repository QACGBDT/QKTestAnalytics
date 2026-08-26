import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileEvidenceStore } from '../src/index.js';

const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qkta-evidence-'));

test('stores base64 screenshots in the legacy-compatible screenshot bucket', () => {
  const rootDir = tempRoot();
  const store = new FileEvidenceStore({ rootDir, uuid: () => 'shot' });
  const artifact = store.save({
    content: Buffer.from('png-bytes').toString('base64'),
    kind: 'screenshot',
    mimeType: 'image/png',
    encoding: 'base64'
  });

  assert.equal(artifact.path, 'img_shot.png');
  assert.equal(artifact.relativePath, 'media-bucket/screenshots/img_shot.png');
  assert.equal(fs.readFileSync(path.join(rootDir, 'screenshots', artifact.path), 'utf8'), 'png-bytes');
});

test('stores text, binary and object attachments', () => {
  const rootDir = tempRoot();
  const ids = ['text', 'bytes', 'json'];
  const store = new FileEvidenceStore({ rootDir, uuid: () => ids.shift() });

  const text = store.save({ content: 'hello', mimeType: 'text/plain' });
  const bytes = store.save({ content: new Uint8Array([1, 2]), extension: 'dat' });
  const object = store.save({ content: { ok: true }, mimeType: 'application/json' });

  assert.equal(text.path, 'evidence_text.txt');
  assert.deepEqual([...fs.readFileSync(path.join(rootDir, 'evidence', bytes.path))], [1, 2]);
  assert.equal(fs.readFileSync(path.join(rootDir, 'evidence', object.path), 'utf8'), '{"ok":true}');
});

test('validates evidence input and falls back from unsafe extensions', () => {
  const rootDir = tempRoot();
  const store = new FileEvidenceStore({ rootDir, uuid: () => 'id' });
  assert.throws(() => store.save(), /content is required/);
  assert.throws(() => store.save({ content: 'x', encoding: 'rot13' }), /unsupported evidence encoding/);
  const artifact = store.save({ content: 'x', extension: '../../js' });
  assert.equal(artifact.path, 'evidence_id.bin');
});
