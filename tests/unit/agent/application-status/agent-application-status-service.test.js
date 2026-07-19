'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../../../../src/modules/agent/application-status/agent-application-status.service');
const repository = require('../../../../src/modules/agent/application-status/agent-application-status.repository');
const documentUrls = require('../../../../src/modules/agent/application-status/document-url.service');

test('agent application status service preserves orchestration', async (t) => {
  await t.test('missing user ID and missing application responses are exact', async () => {
    const originalRepo = repository.findApplicationByUser;
    repository.findApplicationByUser = async () => null;
    try {
      assert.deepEqual(await service.getApplicationStatus({}), {
        statusCode: 401,
        body: { success: false, message: 'Unauthorized.' },
      });
      assert.deepEqual(await service.getApplicationStatus({ userId: 'u1', userName: 'Req Name' }), {
        statusCode: 200,
        body: {
          success: true,
          message: 'No application started yet.',
          data: { applicationStatus: 'DRAFT', hasApplication: false, userName: 'Req Name' },
        },
      });
    } finally {
      repository.findApplicationByUser = originalRepo;
    }
  });

  await t.test('existing application resolves documents and calculates reapply', async () => {
    const originalRepo = repository.findApplicationByUser;
    const originalDocs = documentUrls.resolveDocumentUrls;
    const originalNow = Date.now;
    const rejectedAt = new Date('2026-07-18T13:00:00.000Z');
    repository.findApplicationByUser = async () => ({
      agentId: 'A1',
      applicationStatus: 'REJECTED',
      isPermanentlyRejected: false,
      rejectedAt,
      user: { name: 'Populated' },
      documents: [{ fileKey: 'x' }],
    });
    documentUrls.resolveDocumentUrls = async (docs) => docs.map((doc) => ({ ...doc, previewUrl: 'p' }));
    Date.now = () => new Date('2026-07-19T12:00:00.000Z').getTime();
    try {
      const result = await service.getApplicationStatus({ userId: 'u1', userName: 'Req Name' });
      assert.equal(result.statusCode, 200);
      assert.equal(result.body.data.documents[0].previewUrl, 'p');
      assert.equal(result.body.data.canReapply, false);
      assert.equal(result.body.data.reapplyAvailableAt.toISOString(), '2026-07-19T13:00:00.000Z');
      assert.equal(result.body.data.userName, 'Populated');
    } finally {
      repository.findApplicationByUser = originalRepo;
      documentUrls.resolveDocumentUrls = originalDocs;
      Date.now = originalNow;
    }
  });
});
