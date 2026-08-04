'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const s3Service = require('../../services/s3Service.js');
const objectKeyBuilder = require('../../src/modules/shared/storage/s3-object-key-builder.js');

test('S3 Service Object-Key Exports Characterization', () => {
  // Functions delegated directly to the module
  assert.equal(s3Service.buildS3Path, objectKeyBuilder.buildS3Path);
  assert.equal(s3Service.sanitizeSegment, objectKeyBuilder.sanitizeSegment);

  // Complete exported function surface check
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
    assert.equal(
      typeof s3Service[fnName],
      'function',
      `s3Service.${fnName} must be a function`
    );
  });

  assert.equal(
    Object.keys(s3Service).length,
    expectedFunctions.length,
    `s3Service must export exactly ${expectedFunctions.length} functions`
  );
});
