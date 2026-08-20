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
  const body = status === "REJECTED"
    ? `Your fleet application needs changes. Reason: ${bus.rejectionReason}. Open Your buses to correct and resubmit it.`
    : "Your fleet application has been approved. Shuvmarg will now complete driver, schedule, and activation setup.";
  return {
    title,
    body,
  };
}

module.exports = { validateStatus, applyStatus, buildStatusMessage };
