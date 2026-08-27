const defaultPatterns = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|authorization)\b\s*(?:[:=]\s*|\s+)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi
];

const clonePattern = pattern => new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
const matches = (value, pattern) => clonePattern(pattern).test(value);

export function createReportRedactor(options = {}) {
  const values = (options.values || []).filter(value => typeof value === 'string' && value.length > 0);
  const patterns = (options.patterns || []).filter(value => value instanceof RegExp);
  const replacement = options.replacement || '[REDACTED]';
  const strict = options.strict === true;

  return {
    redact(value, field = 'report data') {
      if (value === null || value === undefined) return value;
      let output = String(value);
      const configuredMatch = values.some(secret => output.includes(secret)) || patterns.some(pattern => matches(output, pattern));
      if (strict && configuredMatch) throw new Error(`sensitive data detected in ${field}`);

      for (const secret of values) output = output.split(secret).join(replacement);
      for (const pattern of patterns) output = output.replace(clonePattern(pattern), replacement);
      for (const pattern of defaultPatterns) output = output.replace(clonePattern(pattern), replacement);
      return output;
    }
  };
}
