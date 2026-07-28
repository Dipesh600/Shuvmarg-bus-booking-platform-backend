"use strict";

const BusOwner = require("../../../../models/busOwnerModel.js");
const User = require("../../../../models/userModel.js");
const Fleet = require("../../../../models/fleetModel.js");
const OperatorBrand = require("../../../../models/operatorBrandModel.js");
const {
  applyDocumentVerdicts,
  invalidDocuments,
} = require("./kyc-verdict.policy.js");

const findOwner = async (id) => {
  let owner = await BusOwner.findOne({ user: id });
  if (!owner) owner = await BusOwner.findById(id);
  return owner;
};

const duplicateFinalization = (owner, verificationStatus) => {
  const sealed = ["approved", "rejected"];
  return (
    verificationStatus &&
    sealed.includes(verificationStatus) &&
    sealed.includes(owner.verificationStatus) &&
    owner.verificationStatus === verificationStatus
  );
};

const syncUserStatus = async (owner, status) => {
  if (status === "approved") {
    await User.findByIdAndUpdate(owner.user, {
      status: "active",
      isVerified: true,
    });
  } else if (status === "rejected") {
    await User.findByIdAndUpdate(owner.user, { isVerified: false });
  }
};

const cascadeRevocation = async (owner, previous, next) => {
  if (
    previous === "approved" &&
    (next === "rejected" || next === "pending")
  ) {
    await Promise.all([
      OperatorBrand.updateMany(
        { ownerId: owner.user },
        {
          status: "SUSPENDED",
          suspendedReason: "Bus owner KYC revoked",
        }
      ),
      Fleet.updateMany(
        { ownerId: owner.user },
        { status: "INACTIVE", approvalStatus: "PENDING" }
      ),
    ]);
    console.log(
      `[KYC Cascade] Suspended brands and fleets for owner ${owner.user} ` +
        "due to KYC revocation."
    );
  }
};

const reviewKyc = async (body, adminId) => {
  const owner = await findOwner(body.id);
  if (!owner) return { statusCode: 404, message: "Bus owner KYC not found!" };
  if (duplicateFinalization(owner, body.verificationStatus)) {
    return {
      statusCode: 409,
      message:
        `This KYC application was already ${owner.verificationStatus} by ` +
        "another admin. Reload the page to see the latest state.",
    };
  }
  applyDocumentVerdicts(owner, body);
  if (body.verificationStatus) {
    owner.verificationStatus = body.verificationStatus;
  }
  if (typeof body.rejectionReason === "string") {
    owner.rejectionReason = body.rejectionReason;
  }
  const previousVerificationStatus = owner.verificationStatus;
  if (
    body.verificationStatus === "approved" ||
    body.verificationStatus === "rejected"
  ) {
    if (adminId) owner.approvedBy = adminId;
    owner.approvedAt = new Date();
    await syncUserStatus(owner, body.verificationStatus);
  }
  await owner.save();
  await cascadeRevocation(
    owner,
    previousVerificationStatus,
    body.verificationStatus
  );
  const user = await User.findById(owner.user).select("name email phone role");
  return {
    owner,
    user,
    status: owner.verificationStatus || "pending",
    documents: invalidDocuments(owner),
  };
};

module.exports = { reviewKyc, duplicateFinalization };
