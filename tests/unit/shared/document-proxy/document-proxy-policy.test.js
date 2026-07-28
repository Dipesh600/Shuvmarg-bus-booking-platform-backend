'use strict';

/**
 * tests/unit/shared/document-proxy/document-proxy-policy.test.js
 *
 * Unit tests for document-proxy.policy.js.
 * All tests exercise pure functions — no network, no DB, no Express.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../../../../src/modules/shared/document-proxy/document-proxy.policy.js');

test('document-proxy policy — normaliseKey', async (t) => {

    await t.test('3. full HTTPS S3 URL is normalised to pathname without leading slash', () => {
        const raw = 'https://my-bucket.s3.ap-south-1.amazonaws.com/owners/abc/kyc/doc.pdf?X-Amz-Signature=sig';
        const { resolvedKey, wasUrl, parseFailed } = policy.normaliseKey(raw);
        assert.equal(wasUrl, true);
        assert.equal(parseFailed, false);
        assert.equal(resolvedKey, 'owners/abc/kyc/doc.pdf');
        assert.ok(!resolvedKey.startsWith('/'));
    });

    await t.test('3b. HTTP URL is also normalised', () => {
        const raw = 'http://bucket.s3.amazonaws.com/agents/123/id.jpg';
        const { resolvedKey } = policy.normaliseKey(raw);
        assert.equal(resolvedKey, 'agents/123/id.jpg');
    });

    await t.test('4. plain object key is returned unchanged', () => {
        const raw = 'owners/abc/kyc/doc.pdf';
        const { resolvedKey, wasUrl } = policy.normaliseKey(raw);
        assert.equal(wasUrl, false);
        assert.equal(resolvedKey, raw);
    });

    await t.test('4b. malformed URL preserves legacy behaviour (returns raw value)', () => {
        const raw = 'https://not a valid url with spaces';
        const { resolvedKey, parseFailed } = policy.normaliseKey(raw);
        assert.equal(parseFailed, true);
        // Original raw value is preserved unchanged
        assert.equal(resolvedKey, raw);
    });
});

test('document-proxy policy — isKeyAllowed', async (t) => {

    await t.test('5. owners/ prefix is allowed', () => {
        assert.equal(policy.isKeyAllowed('owners/123/kyc/doc.pdf'), true);
    });

    await t.test('5b. brands/ prefix is allowed', () => {
        assert.equal(policy.isKeyAllowed('brands/abc/drivers/x/id.jpg'), true);
    });

    await t.test('5c. agents/ prefix is allowed', () => {
        assert.equal(policy.isKeyAllowed('agents/xyz/doc.pdf'), true);
    });

    await t.test('5d. disputes/ prefix is allowed', () => {
        assert.equal(policy.isKeyAllowed('disputes/proof.jpg'), true);
    });

    await t.test('5e. platform/ prefix is allowed', () => {
        assert.equal(policy.isKeyAllowed('platform/themes/card.png'), true);
    });

    await t.test('5f. agent_kyc/ legacy prefix is allowed', () => {
        assert.equal(policy.isKeyAllowed('agent_kyc/doc.pdf'), true);
    });

    await t.test('5g. bus_owner_docs/ legacy prefix is allowed', () => {
        assert.equal(policy.isKeyAllowed('bus_owner_docs/old.pdf'), true);
    });

    await t.test('5h. misc/ prefix is allowed', () => {
        assert.equal(policy.isKeyAllowed('misc/something.jpg'), true);
    });

    await t.test('6. unknown prefix is blocked', () => {
        assert.equal(policy.isKeyAllowed('private/secret.pdf'), false);
    });

    await t.test('6b. empty key is blocked', () => {
        assert.equal(policy.isKeyAllowed(''), false);
    });

    await t.test('6c. partial match (no trailing slash) is blocked', () => {
        // 'owners' without slash must NOT match
        assert.equal(policy.isKeyAllowed('owners'), false);
    });
});

test('document-proxy policy — ALLOWED_PREFIXES', async (t) => {

    await t.test('ALLOWED_PREFIXES is an array of strings', () => {
        assert.ok(Array.isArray(policy.ALLOWED_PREFIXES));
        for (const p of policy.ALLOWED_PREFIXES) {
            assert.equal(typeof p, 'string');
        }
    });

    await t.test('misc/ is present', () => {
        assert.ok(policy.ALLOWED_PREFIXES.includes('misc/'));
    });

    await t.test('agent_kyc/ is present', () => {
        assert.ok(policy.ALLOWED_PREFIXES.includes('agent_kyc/'));
    });

    await t.test('bus_owner_docs/ is present', () => {
        assert.ok(policy.ALLOWED_PREFIXES.includes('bus_owner_docs/'));
    });
});
