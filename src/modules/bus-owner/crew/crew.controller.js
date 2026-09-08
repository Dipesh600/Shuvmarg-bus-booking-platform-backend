"use strict";
const AppError = require("../../../shared/errors/app-error");
const { assertId } = require("./crew-input.policy");

function createCrewController({ assignmentService, DriverProfile, ConductorProfile, logger }) {
  const fail = (error, res) => {
    const status = error.isOperational || Number.isInteger(error.statusCode) ? error.statusCode : error.code === 11000 ? 409
      : ["ValidationError", "CastError"].includes(error.name) ? 400 : 500;
    if (status === 500) logger.error("Crew operation failed", { error: error.message });
    return res.status(status).json({ success: false,
      message: status === 500 ? "Unable to complete crew operation." : error.code === 11000 ? "Conflicting crew record. Refresh and retry." : error.message,
      ...(error.errorCode ? { errorCode: error.errorCode } : {}) });
  };
  const assign = role => async (req, res) => {
    try {
      const data = await assignmentService.assign({ ownerId: req.userInfo?.id, role, input: req.body, files: req.files });
      return res.status(data.alreadyAssigned ? 200 : 201).json({ success: true,
        message: data.notificationStatus === "FAILED"
          ? data.securityUpdated
            ? "Driver security checks completed, but account setup SMS could not be queued."
            : "Crew assigned, but the SMS could not be queued. Retry with resendInvite: true."
          : data.notificationStatus === "QUEUED"
            ? data.securityUpdated
              ? "Driver security checks completed. Account setup SMS was queued."
              : "Crew assigned. SMS invitation queued."
            : data.securityUpdated
              ? data.accessStatus === "ACTIVE"
                ? "Driver security checks completed. Existing account is ready to use."
                : "Driver security checks completed. Account setup is pending."
              : data.alreadyAssigned
                ? "Crew is already assigned."
                : data.activationRequired
                  ? "Crew assigned. Account setup is pending."
                  : "Crew assigned. Existing account is ready to use.", data });
    } catch (error) { return fail(error, res); }
  };
  const remove = role => async (req, res) => {
    try {
      const ownerId = req.userInfo?.id;
      const userId = req.body?.[role === "driver" ? "driverUserId" : "conductorUserId"];
      assertId(ownerId, "Owner"); assertId(userId, "Crew user");
      const Profile = role === "driver" ? DriverProfile : ConductorProfile;
      // Keep admin suspension intact. Removal never deactivates the shared User,
      // removes another role, rotates credentials or revokes unrelated sessions.
      const profile = await Profile.findOne({ userId, ownerId });
      if (!profile) throw new AppError("Crew profile not found or not owned by you.", 404);
      const updated = await Profile.findOneAndUpdate({ _id: profile._id, ownerId, status: profile.status }, {
        $inc: { __v: 1 },
        $set: { status: profile.status === "SUSPENDED" ? "SUSPENDED" : "INACTIVE",
          accessStatus: profile.status === "SUSPENDED" ? "SUSPENDED" : "REMOVED",
          removedAt: profile.removedAt || new Date(), removedBy: ownerId,
          ...(role === "driver" ? { assignedBusId: null } : { assignedTripIds: [] }) },
      }, { new: true, runValidators: true });
      if (!updated) throw new AppError("Crew profile changed. Refresh and retry.", 409);
      return res.status(200).json({ success: true, message: "Crew access removed. Other account roles are unchanged." });
    } catch (error) { return fail(error, res); }
  };
  return { assignDriver: assign("driver"), assignConductor: assign("conductor"),
    removeDriver: remove("driver"), removeConductor: remove("conductor") };
}
module.exports = { createCrewController };
