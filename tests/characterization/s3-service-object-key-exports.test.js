'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const s3Service = require('../../services/s3Service.js');
const objectKeyBuilder = require('../../src/modules/shared/storage/s3-object-key-builder.js');
const { normalizeUploadOptions } = require('../../src/modules/shared/storage/s3-upload-options.js');

test('S3 Service Object-Key Exports Characterization', async (t) => {
  await t.test('exports expected function surface', () => {
    assert.equal(s3Service.buildS3Path, objectKeyBuilder.buildS3Path);
    assert.equal(s3Service.sanitizeSegment, objectKeyBuilder.sanitizeSegment);

    const expectedFunctions = [
      'uploadFileToS3',
      'getPresignedUrl',
      'getDisplayUrl',
      'deleteObjectFromS3',
      'deleteFromS3',
      'listObjectsInFolder',
      'buildS3Path',
      'sanitizeSegment',
    ];

    expectedFunctions.forEach((fnName) => {
      assert.equal(typeof s3Service[fnName], 'function', `s3Service.${fnName} must be a function`);
    });
    assert.equal(Object.keys(s3Service).length, expectedFunctions.length);
  });

  await t.test('accepts valid S3 upload options forms', () => {
    assert.deepEqual(normalizeUploadOptions('owners/123/kyc'), { folder: 'owners/123/kyc', objectName: null, objectKey: null });
    assert.deepEqual(normalizeUploadOptions({ folder: 'owners/123/kyc/company-registration', objectName: 'uuid-1.pdf' }), {
      folder: 'owners/123/kyc/company-registration',
      objectName: 'uuid-1.pdf',
      objectKey: 'owners/123/kyc/company-registration/uuid-1.pdf',
    });
    assert.deepEqual(normalizeUploadOptions({ objectKey: 'owners/123/kyc/company-registration/uuid-1.pdf' }), {
      objectKey: 'owners/123/kyc/company-registration/uuid-1.pdf',
      folder: null,
      objectName: null,
    });
  });

  await t.test('rejects unsafe and malformed S3 paths', () => {
    const invalidInputs = [
      '  owners/kyc',
      'owners/kyc  ',
      'owners/kyc\nfile.pdf',
      'owners/kyc\0file.pdf',
      'owners/kyc\rfile.pdf',
      'owners/kyc\tfile.pdf',
      'owners//file.pdf',
      'owners/./file.pdf',
      'owners/../file.pdf',
      '/owners/file.pdf',
      'owners\\file.pdf',
      { folder: 'owners', objectName: 'kyc/file.pdf' },
      { objectKey: 'key', folder: 'folder', objectName: 'file.pdf' },
      { folder: 'folder' },
    ];

    for (const input of invalidInputs) {
      assert.throws(() => normalizeUploadOptions(input), Error);
    }
  });
});
