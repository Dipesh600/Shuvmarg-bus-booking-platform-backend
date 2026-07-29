"use strict";

function createFleetDashboardService({ repository }) {
  return async function getFleetDashboard() {
    const [
      liveOnNetwork,
      inGarage,
      pendingApproval,
      underMaintenance,
      totalRegistered,
    ] = await repository.countDashboard();

    return {
      statusCode: 200,
      body: {
        success: true,
        message: "Fleet dashboard stats fetched successfully",
        data: {
          totalBuses: totalRegistered,
          activeBuses: liveOnNetwork,
          maintenanceBuses: underMaintenance,
          pendingBuses: pendingApproval,
          liveOnNetwork,
          inGarage,
          pendingApproval,
          underMaintenance,
          totalRegistered,
        },
      },
    };
  };
}

module.exports = { createFleetDashboardService };
