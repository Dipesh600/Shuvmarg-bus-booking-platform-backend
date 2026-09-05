'use strict';
const sensitiveKey = /password|pin|secret|authorization|cookie|token|otp|filekey|documentkey|privatekey|signature/i;
const redactText = text => text
  .replace(/Bearer\s+[^\s,"']+/gi, 'Bearer [REDACTED]')
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
  .replace(/(https?:\/\/[^\s?"']+)\?[^\s"']+/gi, '$1?[REDACTED]');
function redact(value, seen = new WeakSet()) {
  if (typeof value === 'string') return redactText(value);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  const result = Array.isArray(value) ? [] : {};
  for (const key of Reflect.ownKeys(value)) {
    result[key] = typeof key === 'string' && sensitiveKey.test(key) ? '[REDACTED]' : redact(value[key], seen);
  }
  return result;
}
module.exports = { redact };
