"use strict";
const { getEffectiveRoles } = require('../../../shared/auth/account-role.policy');
const AppError = require("../../../shared/errors/app-error");
const { validateAssignment, phoneVariants } = require("./crew-input.policy");
const { assertDriverCompliance } = require("../../../shared/crew/driver-eligibility.policy");
const { persistCrewProfile } = require("./crew-profile-persistence.service");
const { deliverCrewInvitation, enqueueCrewInvitation } = require('./crew-invitation.service');

function createCrewAssignmentService({ mongoose, User, DriverProfile, ConductorProfile, OperatorBrand,
  hashPassword, randomPassword, sendSMS, logger, driverDocuments = null }) {
  const assign = async ({ ownerId, role, input, files = {}, source = "OPERATOR", adminId = null }) => {
    const data = validateAssignment(ownerId, role, input);
    if (role === "driver") assertDriverCompliance({
      licenseNumber: data.licenseNumber,
      licenseType: data.licenseType,
      licenseExpiry: data.licenseExpiry,
    }, { requireDocuments: false });
    const Profile = role === "driver" ? DriverProfile : ConductorProfile;
    const uploaded = [];
    let stagedProfileId = null;
    let stagedLicenseKey = null;
    let result;
    let invitationJobId = null;
    let invitationJobStatus = null;
    try {
      if (role === "driver" && driverDocuments) {
        const brand = await OperatorBrand.findOne({ _id: data.brandId, ownerId, status: "ACTIVE" }).lean();
        if (!brand) throw new AppError("Active brand not found or not owned by you.", 403);
        const matches = await DriverProfile.find({ brandId: data.brandId, ownerId,
          phone: { $in: phoneVariants(data.phone) } }).lean();
        if (matches.length > 1) throw new AppError("Multiple driver records exist. Ask an admin to resolve them.", 409);
        const existing = matches[0];
        if (source === "OPERATOR" && existing?.approvalStatus === "REJECTED") {
          throw new AppError("This driver is blocked and cannot be restored by the operator.", 409);
        }
        if (existing && existing.licenseNumber !== data.licenseNumber) {
          throw new AppError("The license does not match the existing driver record.", 409);
        }
        stagedProfileId = existing?._id || new mongoose.Types.ObjectId();
        if (existing?.approvalStatus === "PENDING" && !files?.licenseDoc) {
          throw new AppError("Upload the driving-license document again to complete the security checks.", 400);
        }
        if (files?.licenseDoc) {
          stagedLicenseKey = await driverDocuments.uploadLicense({ file: files.licenseDoc,
            brandId: data.brandId, driverId: stagedProfileId });
          uploaded.push(stagedLicenseKey);
        } else if (!existing?.licenseDoc && !existing?.documents?.license?.url) {
          throw new AppError("A driving-license document is required.", 400);
        }
        assertDriverCompliance({
          licenseNumber: data.licenseNumber,
          licenseType: data.licenseType,
          licenseExpiry: data.licenseExpiry,
          licenseDoc: stagedLicenseKey || existing?.licenseDoc,
          documents: existing?.documents,
          medicalCertDoc: existing?.medicalCertDoc,
          medicalCertExpiry: existing?.medicalCertExpiry,
        });
      }

      // A random, undisclosed hash satisfies the operational account schema.
      // Invited accounts activate with phone OTP, never with this password.
      const bootstrapHash = await hashPassword(randomPassword());
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const brand = await OperatorBrand.findOne({
            _id: data.brandId, ownerId, status: "ACTIVE",
          }).session(session).lean();
          if (!brand) throw new AppError("Active brand not found or not owned by you.", 403);
          let user = await User.findOne({ phone: { $in: phoneVariants(data.phone) } })
            .select("+password").session(session);
          const isUpgrade = Boolean(user);
          if (user && (user.deletedAt || !["active", "invited"].includes(user.status))) {
            throw new AppError("This account is restricted. Contact support.", 409);
          }
          if (user && !user.password) {
            throw new AppError("This existing account must set a password through account recovery before crew access can be added.",
              409, null, "CREW_PASSWORD_SETUP_REQUIRED");
          }
          if (!user) {
            user = new User({ name: data.name, phone: data.phone, password: bootstrapHash,
              role, roles: [role], status: "invited", forcePasswordChange: true, phoneVerified: false,
              roleActivatedAt: { [role]: new Date() } });
            await user.save({ session });
          } else {
            // Lock the shared account within this transaction. Concurrent role
            // assignments retry and see the committed profile instead of duplicating it.
            const roles = getEffectiveRoles(user);
            await User.updateOne({ _id: user._id }, {
              $addToSet: { roles: { $each: [...new Set([...roles, role])] } },
              $set: { updatedAt: new Date(),
                ...(!roles.includes(role) ? { [`roleActivatedAt.${role}`]: new Date() } : {}) },
            }, { session, runValidators: true });
          }
          result = await persistCrewProfile({ Profile, user, data, ownerId, role, session,
            stagedLicenseKey, stagedProfileId, source, adminId, brand, isUpgrade });
          const invitation = await enqueueCrewInvitation({
            role, result, input, ownerId, brandId: data.brandId, session,
          });
          invitationJobId = invitation.jobId;
          invitationJobStatus = invitation.jobStatus;
          if (invitationJobId) {
            await Profile.updateOne({ _id: result.profileId, accessStatus: "INVITED" }, {
              $set: { invitationDeliveryStatus: "PENDING" },
            }, { session, runValidators: true });
            result.invitationDeliveryStatus = "PENDING";
          }
        });
      } finally {
        await session.endSession();
      }
    } catch (error) {
      const commitOutcomeUnknown = error?.hasErrorLabel?.("UnknownTransactionCommitResult")
        || error?.name === "MongoNetworkError";
      // If MongoDB may have committed but its acknowledgement was lost, retain
      // the object rather than deleting evidence referenced by a committed profile.
      if (uploaded.length && driverDocuments && !commitOutcomeUnknown) await driverDocuments.cleanup(uploaded);
      throw error;
    }
    // No network side effects inside a retryable database transaction.
    // Only a genuinely invited account needs setup instructions. Existing
    // active accounts already have credentials and can use the newly-added role.
    const notificationStatus = await deliverCrewInvitation({
      jobId: invitationJobId,
      jobStatus: invitationJobStatus,
      Profile,
      result,
      sendSMS,
      logger,
    });
    return { ...result, notificationStatus };
  };
  return { assign };
}
module.exports = { createCrewAssignmentService };
