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

        // 3. Fetch Fleets (Buses) — populate both owner and brand
        const fleets = await Bus.find()
            .populate("ownerId", "name email phone")
            .populate("brandId", "brandName brandCode logo")
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
            // Count real uploaded documents across all Bus-Owner-level KYC sections
            const docCount =
                (owner.companyRegistration?.documentUrls?.length || 0) +
                (owner.ownerIdentity?.documentUrls?.length || 0) +
                (owner.taxRegistration?.documentUrls?.length || 0) +
                (owner.bankDetails?.documentUrls?.length || 0);

            unifiedData.push({
                busownerId: owner.busOwnerId,
                companyname: owner.companyName || "N/A",
                owner: owner.user?.name || "Unknown",
                // Normalize date to ISO string so the frontend always formats it the same way
                submitdate: owner.createdAt,
                status: owner.verificationStatus,
                kyctype: "busowner",
                documents: docCount,
                data: owner,
            });
        });

        // Map Fleets (Buses)
        fleets.forEach((fleet) => {
            unifiedData.push({
                fleetId: fleet.fleetId,
                // Use real brand name if available, fallback to bus name
                companyname: fleet.brandId?.brandName || fleet.busName || "N/A",
                brandId: fleet.brandId?._id || null,
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
