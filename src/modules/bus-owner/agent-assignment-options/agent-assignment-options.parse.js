'use strict';

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

const parseQuery = (query = {}) => {
  const brandId = typeof query.brandId === 'string' ? query.brandId.trim() : '';
  const errors = [];
  if (!brandId) errors.push('brandId is required.');
  else if (!OBJECT_ID_RE.test(brandId)) errors.push('brandId is invalid.');
  return { brandId, errors };
};

module.exports = { parseQuery };
