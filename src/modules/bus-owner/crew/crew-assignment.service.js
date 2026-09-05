"use strict";
const { getEffectiveRoles } = require('../../../shared/auth/account-role.policy');
const AppError = require("../../../shared/errors/app-error");
const { validateAssignment, phoneVariants } = require("./crew-input.policy");
const { assertDriverCompliance } = require("../../../shared/crew/driver-eligibility.policy");
const { accessForUser, invitationForAccess } = require("../../../shared/crew/crew-access-state");

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
          const linked = await Profile.find({ userId: user._id }).session(session);
          if (linked.length > 1 || linked.some(p =>
            String(p.brandId) !== String(data.brandId) || String(p.ownerId) !== String(ownerId))) {
            throw new AppError("This crew account is linked elsewhere. Contact support to resolve the assignment.", 409);
          }
          let profile = linked[0];
          if (!profile && role === "driver") {
            const matches = await Profile.find({ brandId: data.brandId, ownerId,
              phone: { $in: phoneVariants(data.phone) } }).session(session);
            if (matches.length > 1 || matches.some(p => p.userId && String(p.userId) !== String(user._id))) {
              throw new AppError("Multiple or conflicting driver records exist. Ask an admin to resolve them.", 409);
            }
            profile = matches[0];
            // Never link an admin registry record using phone alone.
            if (profile && profile.licenseNumber !== data.licenseNumber) {
              throw new AppError("The license does not match the existing driver record.", 409);
            }
          }
          if (stagedLicenseKey && profile && String(profile._id) !== String(stagedProfileId)) {
            throw new AppError("The driver record changed during upload. Refresh and try again.", 409);
          }
          if (source === "OPERATOR" && role === "driver" && profile?.approvalStatus === "REJECTED") {
            throw new AppError("This driver is blocked and cannot be restored by the operator.", 409);
          }
          const securityUpdated = role === "driver" && Boolean(stagedLicenseKey)
            && ["PENDING", "REJECTED"].includes(profile?.approvalStatus);
          const alreadyAssigned = Boolean(profile?.userId && profile.status !== "INACTIVE" && !profile.removedAt);
          if (profile?.status === "SUSPENDED" || profile?.accessStatus === "SUSPENDED") {
            throw new AppError("A suspended crew profile requires admin review.", 409);
          }
          const roleAccessStatus = accessForUser(user);
          const invitationDeliveryStatus = invitationForAccess(roleAccessStatus);
          const stateChangedAt = new Date();
          if (!profile) {
            profile = new Profile({ ...(stagedProfileId ? { _id: stagedProfileId } : {}),
              brandId: data.brandId, ownerId, userId: user._id, fullName: data.name, phone: data.phone,
              accessStatus: roleAccessStatus, invitationDeliveryStatus,
              ...(roleAccessStatus === "INVITED"
                ? { invitedAt: stateChangedAt }
                : { activatedAt: stateChangedAt }),
              ...(role === "driver" ? { licenseNumber: data.licenseNumber, licenseType: data.licenseType,
                licenseExpiry: data.licenseExpiry, gender: data.gender, experienceYears: data.experienceYears,
                licenseDoc: stagedLicenseKey, documents: { license: { url: stagedLicenseKey, validTill: data.licenseExpiry } },
                createdBy: source, ...(source === "ADMIN" ? { adminCreatedBy: adminId } : {}),
                approvalStatus: "APPROVED", approvedAt: new Date(),
                ...(source === "ADMIN" ? { approvedBy: adminId } : {}) } : {
                assignedBy: source === "OPERATOR" ? ownerId : null, createdBy: source,
                ...(source === "ADMIN" ? { adminCreatedBy: adminId } : {}),
              }) });
          } else {
            profile.userId = user._id;
            const restoringAccess = profile.status === "INACTIVE" || Boolean(profile.removedAt)
              || profile.accessStatus === "NOT_LINKED" || profile.accessStatus === "REMOVED";
            if (restoringAccess || profile.accessStatus !== roleAccessStatus) {
              profile.accessStatus = roleAccessStatus;
              profile.invitationDeliveryStatus = invitationDeliveryStatus;
              profile.accessStatusBeforeSuspension = null;
              if (roleAccessStatus === "INVITED") {
                profile.invitedAt ||= stateChangedAt;
                profile.activatedAt = null;
              } else {
                profile.activatedAt ||= stateChangedAt;
              }
            }
            if (role === "driver") {
              profile.fullName = data.name;
              if (data.gender) profile.gender = data.gender;
              profile.experienceYears = data.experienceYears; profile.licenseType = data.licenseType;
              profile.licenseExpiry = data.licenseExpiry;
              if (stagedLicenseKey) {
                profile.licenseDoc = stagedLicenseKey;
                profile.set("documents.license", { url: stagedLicenseKey, validTill: data.licenseExpiry });
                profile.approvalStatus = "APPROVED";
                profile.approvedAt = new Date();
                if (source === "ADMIN") profile.approvedBy = adminId;
              }
            }
            if (profile.status === "INACTIVE" || profile.removedAt) {
              profile.status = "AVAILABLE";
              if (role === "driver") {
                profile.approvalStatus = "APPROVED";
                profile.approvedAt = new Date();
                if (source === "ADMIN") profile.approvedBy = adminId;
              }
            }
            profile.removedAt = null;
            profile.removedBy = null;
          }
          await profile.save({ session });
          result = { userId: user._id, profileId: profile._id, phone: data.phone,
            name: profile.fullName, brand: brand.brandName, isUpgrade, alreadyAssigned,
            securityUpdated, profileStatus: profile.status,
            approvalStatus: role === "driver" ? profile.approvalStatus : null,
            activationRequired: profile.accessStatus === "INVITED",
            accessStatus: profile.accessStatus,
            invitationDeliveryStatus: profile.invitationDeliveryStatus };
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
    const shouldNotify = result.activationRequired
      && (!result.alreadyAssigned || input.resendInvite === true);
    let notificationStatus = "NOT_REQUESTED";
    if (shouldNotify) {
      try {
        const delivery = await sendSMS(result.phone,
          `Sumarg: You are assigned as ${role} for ${result.brand}. Open the Partner app, choose ${role}, tap "Set up invited account", enter ${result.phone}, verify the OTP, and create your password.`);
        notificationStatus = delivery?.queued === true ? "QUEUED" : "FAILED";
      } catch (error) {
        notificationStatus = "FAILED";
        logger.warn("Crew invitation notification failed", { profileId: result.profileId, error: error.message });
      }
      try {
        await Profile.updateOne({ _id: result.profileId, accessStatus: "INVITED" }, {
          $set: { invitationDeliveryStatus: notificationStatus,
            invitationLastAttemptAt: new Date() },
        }, { runValidators: true });
        result.invitationDeliveryStatus = notificationStatus;
      } catch (error) {
        logger.error("Crew invitation state persistence failed", {
          profileId: result.profileId, error: error.message,
        });
        throw new AppError("Crew was saved, but its invitation state could not be recorded. Retry safely.", 500);
      }
    }
    return { ...result, notificationStatus };
  };
  return { assign };
}
module.exports = { createCrewAssignmentService };
