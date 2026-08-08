const { FLEET_APPROVAL_VALUES } = require("../../../contracts");

function validateStatus(status) {
  if (FLEET_APPROVAL_VALUES.includes(status) && status !== "PENDING") return null;
  return {
    statusCode: 400,
    body: {
      success: false,
      message: "Invalid status. Allowed values: APPROVED, REJECTED",
    },
  };
}

function applyStatus(bus, status, rejectionReason, now = new Date()) {
  bus.approvalStatus = status;
  if (status === "APPROVED") {
    bus.status = "ACTIVE";
    bus.approvedAt = now;
    bus.rejectionReason = null;
  } else {
    bus.rejectedAt = now;
    bus.rejectionReason = rejectionReason || "No reason provided";
  }
  return bus;
}

function buildStatusMessage(bus, status) {
  const title = `Fleet Status Update: ${bus.busName} (${bus.busNumber})`;
  const suffix =
    status === "REJECTED" ? ` Reason: ${bus.rejectionReason}` : "";
  return {
    title,
    body: `Your bus fleet status has been updated to ${status}.${suffix}`,
  };
}

module.exports = { validateStatus, applyStatus, buildStatusMessage };
