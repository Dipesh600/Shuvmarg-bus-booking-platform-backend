"use strict";

const BusOwner = require("../../../../models/busOwnerModel");
const User = require("../../../../models/userModel");
const { ReadContractUnauthorizedError, ReadContractNotFoundError } = require("../common/read-errors");
const { mapBusOwnerProfile } = require("./bus-owner-profile.dto");
const { mapBusOwnerKycStatus } = require("./bus-owner-kyc-status.dto");

function createBusOwnerReadService({
  BusOwnerModel = BusOwner,
  UserModel = User,
} = {}) {
  function authorizeOwner(req) {
    const userId = req.userInfo?.id;
    if (!userId || typeof userId !== "string") {
      throw new ReadContractUnauthorizedError("UNAUTHORIZED_OWNER", "Unauthorized. Please login first.");
    }
    return userId;
  }

  async function getOwnProfile(req) {
    const userId = authorizeOwner(req);
    const [user, owner] = await Promise.all([
      UserModel.findById(userId).select("-password -__v -otp -otpExpiry").lean(),
      BusOwnerModel.findOne({ user: userId }).lean(),
    ]);

    if (!user) {
      throw new ReadContractNotFoundError("USER_NOT_FOUND", "User profile record not found.");
    }

    const data = mapBusOwnerProfile(owner, user);
    return {
      success: true,
      data,
    };
  }

  async function getOwnKycStatus(req) {
    const userId = authorizeOwner(req);
    const owner = await BusOwnerModel.findOne({ user: userId }).lean();

    if (!owner) {
      throw new ReadContractNotFoundError("BUS_OWNER_KYC_NOT_FOUND", "Bus owner KYC not found. Please submit your KYC.");
    }

    const data = mapBusOwnerKycStatus(owner);
    return {
      success: true,
      data,
    };
  }

  return {
    getOwnProfile,
    getOwnKycStatus,
  };
}

module.exports = {
  createBusOwnerReadService,
};
