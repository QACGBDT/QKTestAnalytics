import { createHash } from 'node:crypto';

const stableObject = value => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(stableObject);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableObject(value[key])]));
  }
  return value;
};

const errorText = error => {
  if (error === null || error === undefined) return '';
  if (typeof error === 'string') return error;
  if (typeof error.stack === 'string' && error.stack.trim()) return error.stack;
  if (typeof error.message === 'string' && error.message.trim()) {
    return `${error.name || 'Error'}: ${error.message}`;
  }
  try {
    return JSON.stringify(stableObject(error));
  } catch {
    return String(error);
  }
};

export function normalizeFailure(error) {
  const raw = errorText(error).trim();
  if (!raw) return null;

  const lines = raw
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const messageLines = lines.filter(line => !/^at\s+/i.test(line));
  const selected = (messageLines.length ? messageLines : lines).slice(0, 3).join(' | ');

  return selected
    .toLowerCase()
    .replace(/\b\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?z\b/gi, '<timestamp>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b0x[0-9a-f]+\b/gi, '<hex>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hex>')
    .replace(/([/\\][^\s)]+?):\d+:\d+/g, '$1:<line>:<col>')
    .replace(/\b\d{5,}\b/g, '<number>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fingerprintFailure(error) {
  const normalized = normalizeFailure(error);
  if (!normalized) return null;
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 24);
  return {
    fingerprint: `failure:${digest}`,
    normalized,
    sample: errorText(error).trim().slice(0, 500)
  };
}
