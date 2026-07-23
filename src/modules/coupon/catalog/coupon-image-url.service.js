'use strict';

const { getDisplayUrl: prodGetDisplayUrl } = require('../../../../services/s3Service.js');

async function resolveCouponImageUrl(imageUrl, { getDisplayUrl = prodGetDisplayUrl } = {}) {
  if (!imageUrl) return null;
  let key = imageUrl;
  if (key.startsWith('http')) {
    try {
      key = new URL(key).pathname.replace(/^\//, '');
    } catch {
      return null;
    }
  }
  return getDisplayUrl(key);
}

module.exports = {
  resolveCouponImageUrl,
};
