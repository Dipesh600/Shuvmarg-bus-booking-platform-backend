const Agent = require("../../../models/agentModel.js");
const BusOwner = require("../../../models/busOwnerModel.js");
const Bus = require("../../../models/fleetModel.js");

/**
 * Get unified list of all KYC submissions (Agents, Bus Owners, Fleets)
 * GET /api/admin/kyc/unified-list
 */
const getUnifiedKycList = async (req, res) => {
    try {
        // 1. Fetch Agents
        const agents = await Agent.find()
            .populate("user", "name email phone")
            .lean();

        // 2. Fetch Bus Owners
        const busOwners = await BusOwner.find()
            .populate("user", "name email phone")
            .lean();

        // 3. Fetch Fleets (Buses)
        const fleets = await Bus.find()
            .populate("ownerId", "name email phone")
            .lean();

        const unifiedData = [];

        // Map Agents
        agents.forEach((agent) => {
            unifiedData.push({
                agentId: agent.agentId,
                companyname: agent.agentCompanyName || "N/A",
                owner: agent.user?.name || "Unknown",
                submitdate: agent.createdAt,
                status: agent.verificationStatus,
                kyctype: "agent",
                data: agent,
            });
        });

        // Map Bus Owners
        busOwners.forEach((owner) => {
            unifiedData.push({
                busownerId: owner.busOwnerId,
                companyname: owner.companyName || "N/A",
                owner: owner.user?.name || "Unknown",
                submitdate: owner.createdAt,
                status: owner.verificationStatus,
                kyctype: "busowner",
                data: owner,
            });
        });

        // Map Fleets (Buses)
        fleets.forEach((fleet) => {
            unifiedData.push({
                fleetId: fleet.fleetId,
                companyname: fleet.busName || "N/A",
                owner: fleet.ownerId?.name || "Unknown",
                submitdate: fleet.createdAt,
                status: fleet.approvalStatus?.toLowerCase() || "pending",
                kyctype: "fleet",
                data: fleet,
            });
        });

        // Sort by submit date descending
        unifiedData.sort((a, b) => new Date(b.submitdate) - new Date(a.submitdate));

        return res.status(200).json({
            success: true,
            message: "Unified KYC list fetched successfully",
            dashboard: {
                totalAgents: agents.length,
                totalBusOwners: busOwners.length,
                totalFleets: fleets.length,
            },
            data: unifiedData,
        });
    } catch (error) {
        console.error("getUnifiedKycList error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

module.exports = {
    getUnifiedKycList,
};
