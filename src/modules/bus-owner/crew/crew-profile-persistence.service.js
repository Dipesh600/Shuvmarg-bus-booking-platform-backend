"use strict";
const AppError = require("../../../shared/errors/app-error");
const { phoneVariants } = require("./crew-input.policy");
const { accessForUser, invitationForAccess } = require("../../../shared/crew/crew-access-state");
async function persistCrewProfile({ Profile, user, data, ownerId, role, session,
  stagedLicenseKey, stagedProfileId, source, adminId, brand, isUpgrade }) {
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
  return { userId: user._id, profileId: profile._id, phone: data.phone,
    name: profile.fullName, brand: brand.brandName, isUpgrade, alreadyAssigned,
    securityUpdated, profileStatus: profile.status,
    approvalStatus: role === "driver" ? profile.approvalStatus : null,
    activationRequired: profile.accessStatus === "INVITED",
    accessStatus: profile.accessStatus,
    invitationDeliveryStatus: profile.invitationDeliveryStatus };
}
module.exports = { persistCrewProfile };
