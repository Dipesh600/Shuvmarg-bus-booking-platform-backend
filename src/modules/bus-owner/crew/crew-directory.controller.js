"use strict";
const AppError = require("../../../shared/errors/app-error");
const { assertId } = require("./crew-input.policy");

const ROLES = new Set(["driver", "conductor"]);
const STATUSES = new Set(["AVAILABLE", "ON_DUTY", "OFF_DUTY", "INACTIVE", "SUSPENDED"]);
const OWNER_STATUSES = new Set(["AVAILABLE", "OFF_DUTY"]);
const escapeRegex = value => value.replace(/[|\\{}()[\]^$+*?.-]/g, "\\$&");
const id = value => value?._id?.toString?.() || value?.toString?.() || null;

function createCrewDirectoryController({ DriverProfile, ConductorProfile, logger }) {
  const Model = role => role === "driver" ? DriverProfile : role === "conductor" ? ConductorProfile : null;
  const fail = (error, res) => {
    const status = error.isOperational ? error.statusCode : error.name === "CastError" ? 400 : 500;
    if (status === 500) logger.error("Crew directory operation failed", { error: error.message });
    return res.status(status).json({ success: false,
      message: status === 500 ? "Unable to load or update crew." : error.message });
  };
  const listCrew = async (req, res) => {
    try {
      const ownerId = req.userInfo?.id;
      const role = req.query.role;
      assertId(ownerId, "Owner");
      if (!ROLES.has(role)) throw new AppError("role must be driver or conductor.", 400);
      const page = Number(req.query.page || 1), limit = Number(req.query.limit || 20);
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
        throw new AppError("Invalid pagination.", 400);
      }
      const filter = { ownerId };
      if (req.query.brandId) { assertId(req.query.brandId, "Brand"); filter.brandId = req.query.brandId; }
      if (req.query.status) {
        if (!STATUSES.has(req.query.status)) throw new AppError("Invalid crew status.", 400);
        filter.status = req.query.status;
      }
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      if (search.length > 100) throw new AppError("Search is too long.", 400);
      if (search) filter.$or = [
        { fullName: new RegExp(escapeRegex(search), "i") },
        { phone: new RegExp(escapeRegex(search), "i") },
        ...(role === "driver" ? [{ licenseNumber: new RegExp(escapeRegex(search), "i") }] : []),
      ];
      let query = Model(role).find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
        .populate("userId", "status phoneVerified roles");
      if (role === "conductor") query = query.populate({
        path: "assignedTripIds", select: "tripId tripDate departureTime arrivalTime status busId routeId",
        populate: [{ path: "busId", select: "busName busNumber" }, { path: "routeId", select: "routeName fromCity toCity" }],
      });
      const [profiles, total] = await Promise.all([query.lean(), Model(role).countDocuments(filter)]);
      const data = profiles.map(profile => ({
        id: id(profile._id), userId: id(profile.userId), role, fullName: profile.fullName,
        phone: profile.phone, email: profile.email || null, brandId: id(profile.brandId),
        status: profile.status, accessStatus: profile.accessStatus,
        invitationDeliveryStatus: profile.invitationDeliveryStatus,
        phoneVerified: Boolean(profile.userId?.phoneVerified), removedAt: profile.removedAt || null,
        invitedAt: profile.invitedAt || null, activatedAt: profile.activatedAt || null,
        invitationLastAttemptAt: profile.invitationLastAttemptAt || null,
        createdAt: profile.createdAt, ...(role === "driver" ? {
          approvalStatus: profile.approvalStatus, licenseNumber: profile.licenseNumber,
          licenseType: profile.licenseType, licenseExpiry: profile.licenseExpiry,
          gender: profile.gender || null, experienceYears: profile.experienceYears || 0,
          assignedBusId: id(profile.assignedBusId),
        } : { assignedTrips: (profile.assignedTripIds || []).map(trip => ({
          id: id(trip._id), tripId: trip.tripId, tripDate: trip.tripDate,
          departureTime: trip.departureTime, arrivalTime: trip.arrivalTime, status: trip.status,
          bus: trip.busId ? { id: id(trip.busId), name: trip.busId.busName, number: trip.busId.busNumber } : null,
          route: trip.routeId ? { id: id(trip.routeId), name: trip.routeId.routeName,
            from: trip.routeId.fromCity, to: trip.routeId.toCity } : null,
        })) }),
      }));
      return res.status(200).json({ success: true, data,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (error) { return fail(error, res); }
  };
  const updateStatus = async (req, res) => {
    try {
      const ownerId = req.userInfo?.id, role = req.params.role, status = req.body?.status;
      assertId(ownerId, "Owner"); assertId(req.params.profileId, "Crew profile");
      if (!Model(role)) throw new AppError("Invalid crew role.", 400);
      if (!OWNER_STATUSES.has(status)) throw new AppError("Owners may set crew to AVAILABLE or OFF_DUTY only.", 400);
      const profile = await Model(role).findOneAndUpdate({
        _id: req.params.profileId, ownerId, removedAt: null,
        status: { $in: ["AVAILABLE", "OFF_DUTY"] },
      }, { $set: { status }, $inc: { __v: 1 } }, { new: true, runValidators: true }).lean();
      if (!profile) throw new AppError("Active crew profile not found or status is admin-controlled.", 404);
      return res.status(200).json({ success: true, message: `Crew marked ${status === "OFF_DUTY" ? "off duty" : "available"}.`,
        data: { id: id(profile._id), role, status: profile.status } });
    } catch (error) { return fail(error, res); }
  };
  return { listCrew, updateCrewStatus: updateStatus };
}
module.exports = { createCrewDirectoryController };
