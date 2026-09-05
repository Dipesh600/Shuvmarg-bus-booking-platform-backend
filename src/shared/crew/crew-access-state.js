"use strict";

const AppError = require("../../shared/errors/app-error");

const ACCESS_STATUSES = Object.freeze([
  "NOT_LINKED", "INVITED", "ACTIVE", "SUSPENDED", "REMOVED",
]);
const INVITATION_DELIVERY_STATUSES = Object.freeze([
  "NOT_REQUIRED", "PENDING", "QUEUED", "FAILED",
]);

const crewAccessFields = () => ({
  accessStatus: {
    type: String,
    enum: ACCESS_STATUSES,
    default: "NOT_LINKED",
    index: true,
  },
  invitationDeliveryStatus: {
    type: String,
    enum: INVITATION_DELIVERY_STATUSES,
    default: "NOT_REQUIRED",
  },
  invitedAt: { type: Date, default: null },
  activatedAt: { type: Date, default: null },
  invitationLastAttemptAt: { type: Date, default: null },
  accessStatusBeforeSuspension: {
    type: String,
    enum: ["INVITED", "ACTIVE"],
    default: null,
  },
});

const accessForUser = user => user?.status === "invited" ? "INVITED"
  : user?.status === "active" ? "ACTIVE" : "SUSPENDED";

const invitationForAccess = accessStatus => accessStatus === "INVITED"
  ? "PENDING" : "NOT_REQUIRED";

const RESTORABLE_ACCESS_STATUSES = new Set(["INVITED", "ACTIVE"]);

const suspendCrewAccess = profile => {
  if (profile.accessStatus === "SUSPENDED") return;
  // Registry-only profiles have no login access to suspend. Their operational
  // status and compliance decision remain separate persisted dimensions.
  if (profile.accessStatus === "NOT_LINKED") return;
  if (!RESTORABLE_ACCESS_STATUSES.has(profile.accessStatus)) {
    throw new AppError(`Crew access cannot be suspended from ${profile.accessStatus || "an unknown state"}.`, 409);
  }
  profile.accessStatusBeforeSuspension = profile.accessStatus;
  profile.accessStatus = "SUSPENDED";
};

const restoreCrewAccess = profile => {
  if (profile.accessStatus === "NOT_LINKED") return;
  if (profile.accessStatus !== "SUSPENDED") {
    throw new AppError("Crew access is not suspended.", 409);
  }
  const previous = profile.accessStatusBeforeSuspension;
  if (!RESTORABLE_ACCESS_STATUSES.has(previous)) {
    throw new AppError("The pre-suspension access state is missing. Resolve the record before restoration.", 409);
  }
  profile.accessStatus = previous;
  profile.accessStatusBeforeSuspension = null;
};

module.exports = {
  ACCESS_STATUSES,
  INVITATION_DELIVERY_STATUSES,
  crewAccessFields,
  accessForUser,
  invitationForAccess,
  suspendCrewAccess,
  restoreCrewAccess,
};
