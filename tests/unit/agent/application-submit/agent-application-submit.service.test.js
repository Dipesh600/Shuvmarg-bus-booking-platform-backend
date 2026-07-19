'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../../../../src/modules/agent/application-submit/agent-application-submit.service');
const repository = require('../../../../src/modules/agent/application-submit/agent-application-submit.repository');
const policy = require('../../../../src/modules/agent/application-submit/agent-application-submit.policy');
const validator = require('../../../../src/modules/agent/application-submit/application-completeness.validator');

test('agent-application-submit.service', async (t) => {
    t.afterEach(() => {
        repository.findAgentByUserId = undefined;
        repository.saveAgent = undefined;
        policy.isSubmittableStatus = undefined;
        validator.validateCompleteness = undefined;
    });

    await t.test('returns 404 if agent not found', async () => {
        repository.findAgentByUserId = async () => null;
        const res = await service.processSubmit('user1', true);
        assert.equal(res.status, 404);
        assert.equal(res.success, false);
    });

    await t.test('returns 400 if status not submittable', async () => {
        repository.findAgentByUserId = async () => ({ applicationStatus: 'PENDING' });
        policy.isSubmittableStatus = () => false;
        
        const res = await service.processSubmit('user1', true);
        assert.equal(res.status, 400);
        assert.equal(res.message, 'Application is in "PENDING" status and cannot be submitted.');
    });

    await t.test('returns 400 if terms not accepted', async () => {
        repository.findAgentByUserId = async () => ({ applicationStatus: 'DRAFT' });
        policy.isSubmittableStatus = () => true;
        
        const res = await service.processSubmit('user1', false);
        assert.equal(res.status, 400);
        assert.equal(res.message, 'You must accept the Terms and Conditions to submit your application.');
    });

    await t.test('returns 400 if incomplete', async () => {
        repository.findAgentByUserId = async () => ({ applicationStatus: 'DRAFT' });
        policy.isSubmittableStatus = () => true;
        validator.validateCompleteness = () => ({ isValid: false, errors: ['err'] });
        
        const res = await service.processSubmit('user1', true);
        assert.equal(res.status, 400);
        assert.deepEqual(res.errors, ['err']);
    });

    await t.test('returns 200 on success and mutates agent exactly once', async () => {
        const agent = { applicationStatus: 'DRAFT', agentId: '123' };
        repository.findAgentByUserId = async () => agent;
        policy.isSubmittableStatus = () => true;
        validator.validateCompleteness = () => ({ isValid: true });
        
        let saveCount = 0;
        repository.saveAgent = async (a) => { saveCount++; };
        
        const res = await service.processSubmit('user1', true);
        
        assert.equal(res.status, 200);
        assert.equal(agent.applicationStatus, 'PENDING');
        assert.equal(agent.submittedAt instanceof Date, true);
        assert.equal(saveCount, 1);
    });

    await t.test('does not save when rejected policy blocks', async () => {
        const agent = { applicationStatus: 'REJECTED' };
        repository.findAgentByUserId = async () => agent;
        
        let saveCount = 0;
        repository.saveAgent = async () => { saveCount++; };
        
        const reapplyPolicy = require('../../../../src/modules/agent/application-submit/reapply-window.policy');
        reapplyPolicy.getReapplyStatus = () => ({ isPermanentlyRejected: true });
        
        const res = await service.processSubmit('user1', true);
        assert.equal(res.status, 403);
        assert.equal(saveCount, 0);
    });
});
