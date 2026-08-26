import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const extensions = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['text/plain', '.txt'],
  ['application/json', '.json']
]);

function toBuffer(content, encoding) {
  if (Buffer.isBuffer(content)) return content;
  if (content instanceof Uint8Array) return Buffer.from(content);
  if (typeof content !== 'string') return Buffer.from(JSON.stringify(content));
  if (encoding === 'base64') return Buffer.from(content, 'base64');
  if (encoding === 'utf8') return Buffer.from(content, 'utf8');
  throw new TypeError(`unsupported evidence encoding: ${encoding}`);
}

function safeExtension(value) {
  if (!value) return '';
  const normalized = String(value).startsWith('.') ? String(value) : `.${value}`;
  return /^\.[a-z0-9]{1,8}$/i.test(normalized) ? normalized.toLowerCase() : '';
}

export class FileEvidenceStore {
  constructor(options = {}) {
    this.rootDir = options.rootDir || 'qreport-results/media-bucket';
    this.uuid = options.uuid || (() => crypto.randomUUID());
  }

  save(options = {}) {
    if (options.content === undefined || options.content === null) {
      throw new TypeError('evidence content is required');
    }

    const kind = options.kind || 'attachment';
    const mimeType = options.mimeType || 'application/octet-stream';
    const encoding = options.encoding || (typeof options.content === 'string' ? 'utf8' : 'utf8');
    const id = this.uuid();
    const group = kind === 'screenshot' ? 'screenshots' : 'evidence';
    const extension = safeExtension(options.extension) || extensions.get(mimeType) || '.bin';
    const prefix = kind === 'screenshot' ? 'img' : 'evidence';
    const filename = `${prefix}_${id}${extension}`;
    const directory = path.join(this.rootDir, group);
    const filePath = path.join(directory, filename);
    const bytes = toBuffer(options.content, encoding);

    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(filePath, bytes);

    return {
      id,
      kind,
      name: options.name || filename,
      mimeType,
      path: filename,
      relativePath: `media-bucket/${group}/${filename}`,
      size: bytes.length
    };
  }
}
