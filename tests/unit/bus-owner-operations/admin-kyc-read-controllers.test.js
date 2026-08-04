"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createUnifiedKycListController } = require("../../../controllers/adminController/kycVerificationController/kycVerificationcontroller");
const { createKycQueryController } = require("../../../src/modules/admin/bus-owner-management/kyc-query.controller");
const { createKycDocumentReadService } = require("../../../src/modules/bus-owner/kyc-submission/kyc-document-read.service");
const { responseRecorder } = require("./helpers/kyc-test-fixtures");

test("admin KYC read controllers unit tests", async (t) => {
  const kycDocumentReadService = createKycDocumentReadService({
    getPresignedUrl: async (key) => `https://signed.url/${key}`,
  });

  await t.test("unified list controller sanitizes internal errors to HTTP 500 without leaking stack", async () => {
    const getUnifiedKycList = createUnifiedKycListController({
      AgentModel: { find: () => { throw new Error("Sensitive DB Password"); } },
      BusOwnerModel: { find: () => ({ populate: () => ({ lean: async () => [] }) }) },
      BusModel: { find: () => ({ populate: () => ({ populate: () => ({ lean: async () => [] }) }) }) },
    });

    const res = responseRecorder();
    await getUnifiedKycList({}, res);

    assert.equal(res.result().status, 500);
    assert.equal(res.result().body.success, false);
    assert.equal(res.result().body.message, "Internal Server Error");
    assert.equal("error" in res.result().body, false);
  });

  await t.test("unified list controller resolves bus owner S3 keys into presigned URLs", async () => {
    const rawOwner = {
      busOwnerId: "bo-1",
      companyName: "Shuvmarg Express",
      companyRegistration: { documentUrls: ["owners/1/kyc/c.pdf"] },
    };

    const getUnifiedKycList = createUnifiedKycListController({
      AgentModel: { find: () => ({ populate: () => ({ lean: async () => [] }) }) },
      BusOwnerModel: { find: () => ({ populate: () => ({ lean: async () => [rawOwner] }) }) },
      BusModel: { find: () => ({ populate: () => ({ populate: () => ({ lean: async () => [] }) }) }) },
      kycDocumentReadService,
    });

    const res = responseRecorder();
    await getUnifiedKycList({}, res);

    assert.equal(res.result().status, 200);
    const busOwnerItem = res.result().body.data.find((item) => item.kyctype === "busowner");
    assert.equal(busOwnerItem.data.companyRegistration.documentUrls[0], "https://signed.url/owners/1/kyc/c.pdf");
    assert.equal(busOwnerItem.data.companyRegistration.documentReferences[0].storageReference, "owners/1/kyc/c.pdf");
  });

  await t.test("kyc-query.controller resolves S3 keys into presigned URLs for getBusOwnerKycById", async () => {
    const rawOwner = {
      _id: "507f1f77bcf86cd799439011",
      companyRegistration: { documentUrls: ["owners/1/kyc/c.pdf"] },
    };

    const controller = createKycQueryController({
      BusOwnerModel: {
        findOne: () => ({ populate: () => ({ lean: async () => rawOwner }) }),
      },
      kycDocumentReadService,
    });

    const res = responseRecorder();
    await controller.getBusOwnerKycById({ body: { id: "507f1f77bcf86cd799439011" } }, res);

    assert.equal(res.result().status, 200);
    assert.equal(res.result().body.data.companyRegistration.documentUrls[0], "https://signed.url/owners/1/kyc/c.pdf");
    assert.equal(res.result().body.data.companyRegistration.documentReferences[0].storageReference, "owners/1/kyc/c.pdf");
  });
});
