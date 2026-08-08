"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parsePagination, formatPagination } = require("../../../src/modules/read-contracts/common/read-pagination.policy");
const { toIsoDate } = require("../../../src/modules/read-contracts/common/read-date.mapper");
const { mapReadError } = require("../../../src/modules/read-contracts/common/read-error.mapper");
const { ReadContractValidationError, ReadContractNotFoundError } = require("../../../src/modules/read-contracts/common/read-errors");
const { mapFleetDocumentDescriptors, calculateFleetDocumentSummary } = require("../../../src/modules/read-contracts/common/fleet-document-descriptor.mapper");
const { mapKycDocumentDescriptors, calculateKycDocumentSummary } = require("../../../src/modules/read-contracts/common/kyc-document-descriptor.mapper");

test("read pagination policy parses defaults and bounds", () => {
  const def = parsePagination();
  assert.equal(def.page, 1);
  assert.equal(def.limit, 20);
  assert.equal(def.skip, 0);

  const custom = parsePagination({ page: "2", limit: "50" });
  assert.equal(custom.page, 2);
  assert.equal(custom.limit, 50);
  assert.equal(custom.skip, 50);

  assert.throws(() => parsePagination({ page: -1 }), ReadContractValidationError);
  assert.throws(() => parsePagination({ limit: 150 }), ReadContractValidationError);

  const formatted = formatPagination({ page: 2, limit: 10, totalItems: 25 });
  assert.deepEqual(formatted, { page: 2, limit: 10, totalItems: 25, totalPages: 3 });
});

test("read date mapper converts valid dates and returns null for invalid", () => {
  assert.equal(toIsoDate(null), null);
  assert.equal(toIsoDate("invalid-date"), null);
  const now = new Date();
  assert.equal(toIsoDate(now), now.toISOString());
});

test("read error mapper sanitizes 500 errors and preserves domain status codes", () => {
  const notFound = new ReadContractNotFoundError("FLEET_NOT_FOUND", "Fleet record not found.");
  const mappedNotFound = mapReadError(notFound);
  assert.equal(mappedNotFound.statusCode, 404);
  assert.equal(mappedNotFound.payload.error.code, "FLEET_NOT_FOUND");

  const silentLogger = { error: () => {} };
  const rawErr = new Error("Database crashed secret key 123");
  const mapped500 = mapReadError(rawErr, silentLogger);
  assert.equal(mapped500.statusCode, 500);
  assert.equal(mapped500.payload.error.message, "Internal server error.");
  assert.equal(mapped500.payload.error.code, "INTERNAL_SERVER_ERROR");
});

test("fleet and KYC document descriptor mappers map database state accurately", () => {
  const fleetMock = {
    fleetImages: ["http://s3/img1"],
    fleetDocuments: {
      fitnessCert: { url: "http://s3/fit", validTill: new Date("2027-01-01") },
    },
    documentReviews: {
      fitnessCert: { status: "APPROVED" },
    },
  };
  const fleetDescs = mapFleetDocumentDescriptors(fleetMock);
  assert.equal(fleetDescs.fleetImages.status, "PENDING");
  assert.equal(fleetDescs.fitnessCert.status, "APPROVED");
  const fleetSum = calculateFleetDocumentSummary(fleetDescs);
  assert.equal(fleetSum.totalSlots, 5);
  assert.equal(fleetSum.present, 2);

  const kycMock = {
    companyRegistration: { documentUrls: ["http://s3/doc1"], verified: true },
  };
  const kycDescs = mapKycDocumentDescriptors(kycMock);
  assert.equal(kycDescs.companyRegistration.present, true);
  assert.equal(kycDescs.companyRegistration.verified, true);
  const kycSum = calculateKycDocumentSummary(kycDescs);
  assert.equal(kycSum.totalSlots, 3);
  assert.equal(kycSum.present, 1);
  assert.equal(kycSum.verified, 1);
});
