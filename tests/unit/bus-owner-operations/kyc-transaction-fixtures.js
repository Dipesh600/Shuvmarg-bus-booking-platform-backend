"use strict";

const { createKycReviewService } = require("../../../src/modules/bus-owner/kyc-review/kyc-review.service");
const ids = { admin: "507f1f77bcf86cd799439010", owner: "507f1f77bcf86cd799439011", user: "507f1f77bcf86cd799439012" };
const actor = { adminId: ids.admin, tokenRole: "SUPER_ADMIN" };
const admin = { _id: ids.admin, role: "SUPER_ADMIN" };
function sessionLog({ failOnCommit = false } = {}) {
  const operations = []; return { operations, session: { withTransaction: async (work) => { operations.push("start"); try { await work(); if (failOnCommit) throw new Error("commit failure"); operations.push("commit"); } catch (error) { operations.push(`abort:${error.code || error.message}`); throw error; } }, endSession: async () => operations.push("end") } };
}
function owner(overrides = {}) { return { _id: ids.owner, user: ids.user, companyName: "Himalayan Roadways", verificationStatus: "pending", companyRegistration: { documentUrls: ["cr.pdf"] }, taxRegistration: { documentUrls: ["tax.pdf"] }, ownerIdentity: { documentUrls: ["id.pdf"] }, ...overrides }; }
function reviewService({ mockOwner = owner(), session, updateOwner, updateUser, ensureBrand } = {}) {
  return createKycReviewService({
    Admin: { findById: () => ({ lean: async () => admin }) },
    BusOwner: { findOne: async () => mockOwner, findOneAndUpdate: updateOwner || (async () => ({ ...mockOwner, verificationStatus: "approved" })) },
    User: { findById: () => ({ lean: async () => ({ _id: ids.user, role: "busOwner" }) }), findByIdAndUpdate: updateUser || (async () => ({ _id: ids.user })) },
    defaultBrandService: { ensureDefaultBrand: ensureBrand || (async () => ({ brand: { _id: "brand" } })) },
    mongoose: { startSession: async () => session }, logger: { info() {}, error() {} },
  });
}
module.exports = { ids, actor, owner, sessionLog, reviewService };
