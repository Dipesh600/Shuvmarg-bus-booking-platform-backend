'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const s3Service = require('../../../../services/s3Service');
const documentUrls = require('../../../../src/modules/agent/application-status/document-url.service');

test('document URL service preserves legacy resolution behavior', async (t) => {
  await t.test('missing and empty documents return []', async () => {
    assert.deepEqual(await documentUrls.resolveDocumentUrls(), []);
    assert.deepEqual(await documentUrls.resolveDocumentUrls([]), []);
  });

  await t.test('clones documents and resolves only non-http file keys', async () => {
    const original = s3Service.getPresignedUrl;
    const calls = [];
    s3Service.getPresignedUrl = async (key) => {
      calls.push(key);
      return `https://preview.example.test/${key}`;
    };
    const mongooseDoc = {
      toObject: () => ({ type: 'citizenship_front', fileKey: 'agents/doc-a.jpg' }),
    };
    const httpDoc = { type: 'shop_photo', fileKey: 'https://example.test/doc.jpg' };
    const noKeyDoc = { type: 'pan_card' };
    try {
      const result = await documentUrls.resolveDocumentUrls([mongooseDoc, httpDoc, noKeyDoc]);
      assert.deepEqual(calls, ['agents/doc-a.jpg']);
      assert.equal(result[0].previewUrl, 'https://preview.example.test/agents/doc-a.jpg');
      assert.equal(result[1].previewUrl, undefined);
      assert.equal(result[2].previewUrl, undefined);
      assert.deepEqual(httpDoc, { type: 'shop_photo', fileKey: 'https://example.test/doc.jpg' });
      assert.deepEqual(noKeyDoc, { type: 'pan_card' });
    } finally {
      s3Service.getPresignedUrl = original;
    }
  });

  await t.test('resolves multiple non-http documents with Promise.all result order', async () => {
    const original = s3Service.getPresignedUrl;
    s3Service.getPresignedUrl = async (key) => `preview:${key}`;
    try {
      const result = await documentUrls.resolveDocumentUrls([
        { fileKey: 'a' },
        { fileKey: 'b' },
      ]);
      assert.deepEqual(result.map((doc) => doc.previewUrl), ['preview:a', 'preview:b']);
    } finally {
      s3Service.getPresignedUrl = original;
    }
  });
});
