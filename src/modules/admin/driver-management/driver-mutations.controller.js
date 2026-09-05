"use strict";
const AppError = require("../../../shared/errors/app-error");
const { assertDriverCompliance, assertDriverEligible } = require("../../../shared/crew/driver-eligibility.policy");
const { normalize, review } = require("./driver-mutation.policy");
const { assertId } = require("../../bus-owner/crew/crew-input.policy");
const { suspendCrewAccess, restoreCrewAccess } = require("../../../shared/crew/crew-access-state");

const EDITABLE = ["fullName", "phone", "gender", "experienceYears", "licenseNumber", "licenseType",
  "licenseExpiry", "status"];
const REVIEW_FIELDS = ["fullName", "phone", "licenseNumber", "licenseType", "licenseExpiry"];
const comparable = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "");

function createDriverMutationsController({ DriverProfile, OperatorBrand, Fleet, documents, assignmentService, logger }) {
  const fail = (error, res) => {
    const status = error.isOperational || Number.isInteger(error.statusCode) ? error.statusCode : error.code === 11000 || error.name === "VersionError" ? 409
      : ["ValidationError", "CastError"].includes(error.name) ? 400 : 500;
    if (status === 500) logger.error("Driver operation failed", { error: error.message });
    return res.status(status).json({ success: false, message: status === 500
      ? "Unable to complete driver operation." : error.message });
  };
  const actor = req => { assertId(req.adminInfo?.id, "Admin"); return req.adminInfo.id; };
  const createDriver = async (req, res) => {
    const uploaded = [];
    let persistenceAttempted = false;
    try {
      const adminId = actor(req);
      assertId(req.body.brandId, "Brand");
      const brand = await OperatorBrand.findById(req.body.brandId).lean();
      if (!brand) throw new AppError("Brand not found.", 404);
      if (brand.status !== "ACTIVE") throw new AppError("Only ACTIVE brands can add drivers.", 403);
      if (assignmentService) {
        const result = await assignmentService.assign({ ownerId: brand.ownerId, role: "driver",
          input: { ...req.body, name: req.body.fullName }, files: req.files,
          source: "ADMIN", adminId });
        return res.status(result.alreadyAssigned ? 200 : 201).json({ success: true,
          message: result.notificationStatus === "FAILED"
            ? "Driver security checks completed, but account setup SMS could not be queued."
            : result.notificationStatus === "QUEUED"
              ? "Driver security checks completed. Account setup SMS queued."
              : result.alreadyAssigned
                ? "Driver is already assigned."
                : result.activationRequired
                  ? "Driver created and ready. Account setup is pending."
                  : "Driver created and ready. Existing account can use the Driver role.", data: result });
      }
      const fields = Object.fromEntries(EDITABLE.filter(key => key !== "status" && req.body[key] !== undefined)
        .map(key => [key, req.body[key]]));
      const driver = new DriverProfile({ ...fields, brandId: brand._id, ownerId: brand.ownerId,
        approvalStatus: "APPROVED", approvedBy: adminId, approvedAt: new Date(), createdBy: "ADMIN",
        adminCreatedBy: adminId });
      normalize(driver);
      assertDriverCompliance(driver, { requireDocuments: false });
      documents.validateFiles(req.files, { required: true });
      await driver.validate();
      await documents.upload(driver, req.files, uploaded);
      persistenceAttempted = true;
      await driver.save();
      return res.status(201).json({ success: true, message: "Driver created and ready.", data: driver });
    } catch (error) {
      if (!persistenceAttempted || ["ValidationError", "VersionError"].includes(error.name) || error.code === 11000) await documents.cleanup(uploaded);
      return fail(error, res);
    }
  };
  const updateDriver = async (req, res) => {
    const uploaded = [];
    let persistenceAttempted = false;
    try {
      const adminId = actor(req);
      const driver = await DriverProfile.findById(req.params.id);
      if (!driver) throw new AppError("Driver not found.", 404);
      const before = Object.fromEntries(REVIEW_FIELDS.map(key => [key, comparable(driver[key])]));
      for (const key of EDITABLE) if (req.body[key] !== undefined) driver[key] = req.body[key];
      normalize(driver);
      if (driver.userId && before.phone !== driver.phone) {
        throw new AppError("Linked account phone changes must use the verified account-change process.", 409);
      }
      if (driver.removedAt && driver.status !== "INACTIVE" && driver.status !== "SUSPENDED") {
        throw new AppError("This driver was removed by the operator. Reassign crew access before reactivating.", 409);
      }
      if (["PENDING", "REJECTED"].includes(driver.approvalStatus) && !req.files?.licenseDoc) {
        throw new AppError("Re-upload the driving-license document to complete the automated security checks.", 400);
      }
      assertDriverCompliance(driver, { requireDocuments: false });
      documents.validateFiles(req.files);
      await driver.validate();
      const changed = REVIEW_FIELDS.some(key => before[key] !== comparable(driver[key]))
        || Boolean(req.files?.licenseDoc);
      await documents.upload(driver, req.files, uploaded);
      if (changed) {
        assertDriverCompliance(driver);
        if (driver.approvalStatus !== "APPROVED" && !driver.removedAt && driver.status !== "SUSPENDED") {
          review(driver, "APPROVED", adminId, "Validated by admin after automated document security checks.");
          if (driver.status === "INACTIVE") driver.status = "AVAILABLE";
          if (driver.accessStatus === "SUSPENDED") {
            restoreCrewAccess(driver);
          }
        }
        driver.approvedBy = adminId;
        driver.approvedAt = new Date();
        driver.rejectionReason = null;
      }
      if (req.body.status === "SUSPENDED" && driver.accessStatus !== "SUSPENDED") {
        suspendCrewAccess(driver);
      } else if (["AVAILABLE", "OFF_DUTY"].includes(req.body.status)
        && driver.accessStatus === "SUSPENDED" && driver.approvalStatus === "APPROVED") {
        restoreCrewAccess(driver);
      }
      persistenceAttempted = true;
      await driver.save();
      return res.status(200).json({ success: true, message: "Driver updated.", data: driver });
    } catch (error) {
      if (!persistenceAttempted || ["ValidationError", "VersionError"].includes(error.name) || error.code === 11000) await documents.cleanup(uploaded);
      return fail(error, res);
    }
  };
  const rejectDriver = async (req, res) => {
    try {
      const adminId = actor(req);
      const reason = req.body?.reason;
      if (typeof reason !== "string" || !reason.trim() || reason.length > 2000) throw new AppError("Rejection reason is required (up to 2000 characters).", 400);
      const driver = await DriverProfile.findById(req.params.id);
      if (!driver) throw new AppError("Driver not found.", 404);
      review(driver, "REJECTED", adminId, reason.trim());
      // A review rejection must not clear a separate admin suspension.
      if (driver.status !== "SUSPENDED") driver.status = "INACTIVE";
      suspendCrewAccess(driver);
      driver.rejectionReason = reason.trim();
      driver.rejectedBy = adminId;
      driver.rejectedAt = new Date();
      await driver.save();
      return res.status(200).json({ success: true, message: "Driver rejected.", data: driver });
    } catch (error) { return fail(error, res); }
  };
  const assignBusToDriver = async (req, res) => {
    try {
      actor(req);
      assertId(req.body?.busId, "Bus");
      const fleet = await Fleet.findById(req.body.busId).lean();
      if (!fleet) throw new AppError("Fleet not found.", 404);
      if (fleet.approvalStatus !== "APPROVED" || fleet.status !== "ACTIVE") throw new AppError("The bus must be APPROVED and ACTIVE.", 400);
      const driver = await DriverProfile.findById(req.params.id);
      assertDriverEligible(driver, { brandId: fleet.brandId });
      driver.assignedBusId = fleet._id;
      await driver.save();
      return res.status(200).json({ success: true, message: "Driver assigned to bus.", data: driver });
    } catch (error) { return fail(error, res); }
  };
  return { createDriver, updateDriver, rejectDriver, assignBusToDriver };
}
module.exports = { createDriverMutationsController };
