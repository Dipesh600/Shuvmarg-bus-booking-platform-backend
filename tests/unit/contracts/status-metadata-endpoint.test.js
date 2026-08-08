"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createContractMetadataController } = require("../../../src/modules/contract-metadata/contract-metadata.controller");
const { API_CONTRACT_VERSION } = require("../../../src/contracts");

function mockResponse() {
  let statusCode;
  let body;
  const headers = {};
  return {
    setHeader(key, val) {
      headers[key] = val;
      return this;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
    result: () => ({ statusCode, body, headers }),
  };
}

test("contract metadata controller integration tests", async (t) => {
  await t.test("returns 200 with X-API-Contract-Version header and public status metadata", async () => {
    const controller = createContractMetadataController();
    const res = mockResponse();

    await controller.getStatuses({}, res);
    const result = res.result();

    assert.equal(result.statusCode, 200);
    assert.equal(result.headers["X-API-Contract-Version"], API_CONTRACT_VERSION);
    assert.equal(result.body.success, true);
    assert.equal(result.body.contractVersion, API_CONTRACT_VERSION);
    assert.ok(result.body.data.ownerVerification);
    assert.ok(result.body.data.fleetApproval);
    assert.ok(result.body.data.fleetOperational);
    assert.ok(result.body.data.fleetDocumentReview);
    assert.ok(result.body.data.kycDocumentState);

    // Verify metadata excludes transition rules, security decisions, database keys
    assert.equal(result.body.data.transitions, undefined);
    assert.equal(result.body.data.securityRules, undefined);
  });
});
