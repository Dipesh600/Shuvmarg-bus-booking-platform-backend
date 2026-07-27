"use strict";

const BusOwner = require("../../../../models/busOwnerModel.js");
const Fleet = require("../../../../models/fleetModel.js");

const getBusOwnerDashboard = async (_req, res) => {
  try {
    const [totalBusOwners, verifiedOwners, pendingKyc, totalFleets] =
      await Promise.all([
        BusOwner.countDocuments({}),
        BusOwner.countDocuments({ verificationStatus: "approved" }),
        BusOwner.countDocuments({ verificationStatus: "pending" }),
        Fleet.countDocuments({}),
      ]);
    const percentage =
      totalBusOwners > 0
        ? ((verifiedOwners / totalBusOwners) * 100).toFixed(0)
        : 0;
    return res.status(200).json({
      success: true,
      data: {
        totalBusOwners,
        verifiedOwners: `${verifiedOwners} (${percentage}% of total)`,
        pendingKyc,
        totalFleets,
      },
    });
  } catch (error) {
    console.error("getBusOwnerDashboard error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch bus owner dashboard stats",
      error: error.message,
    });
  }
};

module.exports = { getBusOwnerDashboard };
