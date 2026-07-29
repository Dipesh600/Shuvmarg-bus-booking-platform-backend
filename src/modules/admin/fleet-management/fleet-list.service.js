"use strict";

function createFleetListService({ repository, policy, mapper }) {
  return async function listFleets(input) {
    const query = policy.buildFleetQuery(input);
    const fleets = await repository.findAll(query);
    if (!fleets || fleets.length === 0) {
      return {
        statusCode: 200,
        body: {
          success: true,
          message: policy.getEmptyFleetMessage(input),
          results: 0,
          data: [],
        },
      };
    }

    const withSchedules = policy.needsScheduleSummary(input);
    const data = await Promise.all(
      fleets.map(async (fleet) => {
        const schedule = withSchedules
          ? await repository.findActiveSchedule(fleet._id)
          : null;
        return mapper.mapFleet(fleet, schedule);
      })
    );

    return {
      statusCode: 200,
      body: {
        success: true,
        message: "Fleets fetched successfully",
        results: data.length,
        data,
      },
    };
  };
}

module.exports = { createFleetListService };
