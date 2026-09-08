"use strict";
const AppError = require("../../../shared/errors/app-error");
const { assertId } = require("../../bus-owner/crew/crew-input.policy");
const { suspendCrewAccess, restoreCrewAccess } = require("../../../shared/crew/crew-access-state");

const STATUSES = new Set(["AVAILABLE", "ON_DUTY", "OFF_DUTY", "SUSPENDED", "INACTIVE"]);
const ADMIN_STATUSES = new Set(["AVAILABLE", "OFF_DUTY", "SUSPENDED"]);
const { id, map } = require("./conductor.mapper");

function createAdminConductorController({ ConductorProfile, OperatorBrand, assignmentService, logger }) {
  const fail = (error, res) => {
    const status = error.isOperational ? error.statusCode : error.code === 11000 || error.name === "VersionError" ? 409
      : ["ValidationError", "CastError"].includes(error.name) ? 400 : 500;
    if (status === 500) logger.error("Admin conductor operation failed", { error: error.message });
    return res.status(status).json({ success: false,
      message: status === 500 ? "Unable to complete staff operation." : error.message });
  };
  const actor = req => { assertId(req.adminInfo?.id, "Admin"); return req.adminInfo.id; };
  const populate = query => query.populate("brandId", "brandName ownerId")
    .populate("userId", "status phoneVerified roles")
    .populate({ path: "assignedTripIds", select: "tripId tripDate departureTime arrivalTime status busId routeId",
      populate: [{ path: "busId", select: "busName busNumber" },
        { path: "routeId", select: "routeName fromCity toCity" }] });
  const validateFilters = query => {
    const filter = {};
    if (query.status) {
      if (!STATUSES.has(query.status)) throw new AppError("Invalid conductor status.", 400);
      filter.status = query.status;
    }
    return filter;
  };
  const listByBrand = async (req, res) => {
    try {
      actor(req); assertId(req.params.brandId, "Brand");
      const filter = { brandId: req.params.brandId, ...validateFilters(req.query) };
      const conductors = await populate(ConductorProfile.find(filter)).sort({ createdAt: -1 }).lean();
      return res.status(200).json({ success: true, results: conductors.length, data: conductors.map(map) });
    } catch (error) { return fail(error, res); }
  };
  const listAll = async (req, res) => {
    try {
      actor(req);
      const page = Number(req.query.page || 1), limit = Number(req.query.limit || 30);
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new AppError("Invalid pagination.", 400);
      }
      const filter = validateFilters(req.query);
      if (req.query.brandId) { assertId(req.query.brandId, "Brand"); filter.brandId = req.query.brandId; }
      const [conductors, total] = await Promise.all([
        populate(ConductorProfile.find(filter)).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        ConductorProfile.countDocuments(filter),
      ]);
      return res.status(200).json({ success: true, results: conductors.length,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }, data: conductors.map(map) });
    } catch (error) { return fail(error, res); }
  };
  const getOne = async (req, res) => {
    try {
      actor(req); assertId(req.params.id, "Conductor");
      const profile = await populate(ConductorProfile.findById(req.params.id)).lean();
      if (!profile) throw new AppError("Conductor not found.", 404);
      return res.status(200).json({ success: true, data: map(profile) });
    } catch (error) { return fail(error, res); }
  };
  const create = async (req, res) => {
    try {
      const adminId = actor(req); assertId(req.body?.brandId, "Brand");
      const brand = await OperatorBrand.findById(req.body.brandId).lean();
      if (!brand) throw new AppError("Brand not found.", 404);
      if (brand.status !== "ACTIVE") throw new AppError("Only ACTIVE brands can add staff.", 403);
      const result = await assignmentService.assign({ ownerId: id(brand.ownerId), role: "conductor",
        input: req.body, source: "ADMIN", adminId });
      return res.status(result.alreadyAssigned ? 200 : 201).json({ success: true,
        message: result.notificationStatus === "FAILED"
          ? "Staff account created, but the SMS could not be queued. Retry the invitation."
          : result.notificationStatus === "QUEUED" ? "Staff account created. SMS invitation queued."
          : result.alreadyAssigned
            ? "Staff member is already assigned."
            : result.activationRequired
              ? "Staff account created. Account setup is pending."
              : "Staff member added. Existing account can use the Conductor role.", data: result });
    } catch (error) { return fail(error, res); }
  };
  const update = async (req, res) => {
    try {
      actor(req); assertId(req.params.id, "Conductor");
      const profile = await ConductorProfile.findById(req.params.id);
      if (!profile) throw new AppError("Conductor not found.", 404);
      if (req.body.phone !== undefined && req.body.phone !== profile.phone) {
        throw new AppError("Linked account phone changes must use the verified account-change process.", 409);
      }
      if (req.body.fullName !== undefined) {
        const name = typeof req.body.fullName === "string" ? req.body.fullName.trim() : "";
        if (name.length < 3 || name.length > 100) throw new AppError("Name must contain 3–100 characters.", 400);
        profile.fullName = name;
      }
      if (req.body.notes !== undefined) {
        if (req.body.notes !== null && (typeof req.body.notes !== "string" || req.body.notes.length > 2000)) {
          throw new AppError("Notes must contain up to 2000 characters.", 400);
        }
        profile.notes = req.body.notes?.trim() || null;
      }
      await profile.save();
      return res.status(200).json({ success: true, message: "Staff details updated.", data: map(profile.toObject()) });
    } catch (error) { return fail(error, res); }
  };
  const updateStatus = async (req, res) => {
    try {
      const adminId = actor(req); assertId(req.params.id, "Conductor");
      const next = req.body?.status, reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      if (!ADMIN_STATUSES.has(next)) throw new AppError("Admin status must be AVAILABLE, OFF_DUTY or SUSPENDED.", 400);
      if (next === "SUSPENDED" && (!reason || reason.length > 2000)) {
        throw new AppError("A suspension reason is required (up to 2000 characters).", 400);
      }
      const profile = await ConductorProfile.findById(req.params.id);
      if (!profile) throw new AppError("Conductor not found.", 404);
      if (profile.removedAt || profile.status === "INACTIVE") {
        throw new AppError("Operator-removed staff must be rehired by the operator before reactivation.", 409);
      }
      if (profile.status === "ON_DUTY" && next !== "SUSPENDED") {
        throw new AppError("On-trip status is controlled by the trip lifecycle.", 409);
      }
      const previous = profile.status;
      profile.status = next;
      profile.statusHistory ||= [];
      profile.statusHistory.push({ from: previous, to: next, actorId: adminId, at: new Date(), reason: reason || null });
      if (next === "SUSPENDED") {
        suspendCrewAccess(profile);
        profile.suspendedBy = adminId; profile.suspendedAt = new Date(); profile.suspensionReason = reason;
      } else if (previous === "SUSPENDED" || profile.accessStatus === "SUSPENDED") {
        restoreCrewAccess(profile);
        profile.suspendedBy = null; profile.suspendedAt = null; profile.suspensionReason = null;
      }
      await profile.save();
      return res.status(200).json({ success: true,
        message: next === "SUSPENDED" ? "Staff member suspended." : "Staff member returned to service.",
        data: map(profile.toObject()) });
    } catch (error) { return fail(error, res); }
  };
  return { createConductor: create, getConductorsByBrand: listByBrand, getAllConductors: listAll,
    getConductorById: getOne, updateConductor: update, updateConductorStatus: updateStatus };
}
module.exports = { createAdminConductorController };
