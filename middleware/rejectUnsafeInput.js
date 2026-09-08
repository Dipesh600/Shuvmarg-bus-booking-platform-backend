'use strict';

function hasUnsafeKeys(value, depth = 0) {
  if (!value || typeof value !== 'object') return false;
  if (depth > 50) return true;
  return Object.keys(value).some(key => key.includes('$') || key.includes('.')
    || ['__proto__', 'prototype', 'constructor'].includes(key)
    || hasUnsafeKeys(value[key], depth + 1));
}

module.exports = (req, res, next) => {
  // Reject ambiguous Mongo operator inputs after parsing. Express 5 query is
  // a getter, so mutating a temporary query object provides no protection.
  if (hasUnsafeKeys(req.body) || hasUnsafeKeys(req.query)) {
    return res.status(400).json({ success: false, errorCode: 'UNSAFE_INPUT_KEYS',
      message: 'Request fields contain unsupported keys or excessive nesting.' });
  }
  return next();
};
