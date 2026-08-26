import { createHash } from 'node:crypto';

const normalizeText = value => String(value ?? '').trim().replace(/\s+/g, ' ');

const stableValue = value => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, stableValue(value[key])])
    );
  }
  if (['string', 'number', 'boolean'].includes(typeof value)) return value;
  return String(value);
};

export function buildTestIdentityKey(test = {}, execution = {}) {
  const explicit = normalizeText(test.historyId ?? test.stableId);
  if (explicit) return `explicit:${explicit}`;

  return JSON.stringify({
    project: normalizeText(execution.project),
    suite: normalizeText(test.suite),
    name: normalizeText(test.name),
    parameters: stableValue(test.parameters ?? test.params)
  });
}

export function createTestIdentity(test = {}, execution = {}) {
  const key = buildTestIdentityKey(test, execution);
  if (key.startsWith('explicit:')) {
    return { id: key.slice('explicit:'.length), key, strategy: 'explicit' };
  }

  const digest = createHash('sha256').update(key).digest('hex').slice(0, 24);
  return { id: `qkta:${digest}`, key, strategy: 'derived' };
}
