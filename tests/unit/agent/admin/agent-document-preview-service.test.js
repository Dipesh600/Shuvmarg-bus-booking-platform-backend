'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const s3Service = require('../../../../services/s3Service');
const preview = require('../../../../src/modules/agent/admin/directory/agent-document-preview.service');

test('agent document preview service resolves only S3 keys concurrently', async () => {
  const calls = [];
  const original = s3Service.getPresignedUrl;
  s3Service.getPresignedUrl = async (key) => {
    calls.push(key);
    return `signed:${key}`;
  };
  try {
    const docs = await preview.resolveDocumentUrls([
      { toObject: () => ({ type: 'citizenship_front', fileKey: 'agents/a.jpg' }) },
      { type: 'shop_photo', fileKey: 'https://cdn.example.test/photo.jpg' },
      { type: 'pan_card' },
    ]);
    assert.deepEqual(calls, ['agents/a.jpg']);
    assert.equal(docs[0].previewUrl, 'signed:agents/a.jpg');
    assert.equal(docs[1].previewUrl, undefined);
    assert.deepEqual(await preview.resolveDocumentUrls([]), []);
    assert.deepEqual(await preview.resolveDocumentUrls(null), []);
  } finally {
    s3Service.getPresignedUrl = original;
  }
});
