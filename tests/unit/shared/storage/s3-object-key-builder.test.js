'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizeSegment,
  buildS3Path,
} = require('../../../../src/modules/shared/storage/s3-object-key-builder.js');

test('S3 Object-Key Builder Unit Tests', async (t) => {
  await t.test('sanitizeSegment contract cases', () => {
    // Falsy values
    [undefined, null, '', 0, false].forEach((val) => {
      assert.equal(sanitizeSegment(val), 'unknown');
    });

    // Normalization & special chars
    assert.equal(sanitizeSegment(' HELLO World '), 'hello-world');
    assert.equal(sanitizeSegment('Special @#$% Chars!'), 'special-chars');
    assert.equal(sanitizeSegment('---multi---hyphen---'), 'multi-hyphen');
    assert.equal(sanitizeSegment('keep_underscores_123'), 'keep_underscores_123');

    // 64-char cap
    const longInput = 'a'.repeat(100);
    assert.equal(sanitizeSegment(longInput).length, 64);
  });

  await t.test('buildS3Path exact path contracts', () => {
    const cases = [
      [
        { type: 'owner_kyc', ownerId: 'own1', documentType: 'citizenship' },
        'owners/own1/kyc/citizenship',
      ],
      [
        { type: 'fleet_images', ownerId: 'own1', brandId: 'b1', fleetId: 'FL-1' },
        'owners/own1/brands/b1/fleets/fl-1/images',
      ],
      [
        { type: 'fleet_images', ownerId: 'own1', fleetId: 'FL-1' },
        'owners/own1/brands/no-brand/fleets/fl-1/images',
      ],
      [
        { type: 'fleet_docs', ownerId: 'own1', brandId: 'b1', fleetId: 'FL-1', documentType: 'fitness' },
        'owners/own1/brands/b1/fleets/fl-1/docs/fitness',
      ],
      [
        { type: 'fleet_docs', ownerId: 'own1', fleetId: 'FL-1', documentType: 'fitness' },
        'owners/own1/brands/no-brand/fleets/fl-1/docs/fitness',
      ],
      [
        { type: 'driver_docs', brandId: 'b1', driverId: 'd1', documentType: 'license' },
        'brands/b1/drivers/d1/docs/license',
      ],
      [
        { type: 'agent_kyc', agentId: 'ag1', documentType: 'pan' },
        'agents/ag1/kyc/pan',
      ],
      [
        { type: 'dispute_proof', disputeType: 'mismatch', transactionId: 'tx1' },
        'disputes/mismatch/tx1',
      ],
      [
        { type: 'dispute_proof', transactionId: 'tx1' },
        'disputes/general/tx1',
      ],
      [
        { type: 'scratch_theme' },
        'platform/scratch-themes',
      ],
      [
        { type: 'coupon_image' },
        'platform/coupons',
      ],
      [
        { type: 'custom_type' },
        'misc/custom_type',
      ],
      [
        {},
        'misc/unknown',
      ],
    ];

    cases.forEach(([opts, expected]) => {
      assert.equal(buildS3Path(opts), expected);
    });
  });

  await t.test('buildS3Path without arguments throws TypeError', () => {
    assert.throws(() => {
      buildS3Path();
    }, TypeError);
  });
});
