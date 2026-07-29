"use strict";

function createFleetStatusService({ repository, policy, notify, clock }) {
  return async function updateFleetStatus(input) {
    const validation = policy.validateStatus(input.status);
    if (validation) return validation;

    const bus = await repository.findForStatusUpdate(input.fleetId);
    if (!bus) {
      return {
        statusCode: 404,
        body: { success: false, message: "Bus not found" },
      };
    }

    policy.applyStatus(
      bus,
      input.status,
      input.rejectionReason,
      clock()
    );
    await bus.save();
    await notify(bus, input.status);

    return {
      statusCode: 200,
      body: {
        success: true,
        message: `Fleet status updated to ${input.status}`,
        data: bus,
      },
    };
  };
}

module.exports = { createFleetStatusService };
