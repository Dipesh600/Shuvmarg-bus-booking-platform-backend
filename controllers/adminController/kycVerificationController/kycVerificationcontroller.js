"use strict";

const Agent = require("../../../models/agentModel.js");
const BusOwner = require("../../../models/busOwnerModel.js");
const Bus = require("../../../models/fleetModel.js");
const { getPresignedUrl } = require("../../../services/s3Service.js");
const { createKycDocumentReadService } = require("../../../src/modules/bus-owner/kyc-submission/kyc-document-read.service.js");

const defaultKycDocumentReadService = createKycDocumentReadService({ getPresignedUrl });

function createUnifiedKycListController({
  AgentModel = Agent,
  BusOwnerModel = BusOwner,
  BusModel = Bus,
  kycDocumentReadService = defaultKycDocumentReadService,
} = {}) {
  return async function getUnifiedKycList(req, res) {
    try {
      const [agents, rawBusOwners, fleets] = await Promise.all([
        AgentModel.find().populate("user", "name email phone").lean(),
        BusOwnerModel.find().populate("user", "name email phone").lean(),
        BusModel.find().populate("ownerId", "name email phone").populate("brandId", "brandName brandCode logo").lean(),
      ]);

      const busOwners = await Promise.all(
        rawBusOwners.map((owner) => kycDocumentReadService.resolveOwnerKycDocuments(owner))
      );

      const unifiedData = [];

      agents.forEach((agent) => {
        unifiedData.push({
          agentId: agent.agentId,
          companyname: agent.businessName || agent.user?.name || agent.agentId || "N/A",
          owner: agent.user?.name || "Unknown",
          location: [agent.municipality, agent.district].filter(Boolean).join(", "),
          documents: agent.documents ? agent.documents.length : 0,
          submitdate: agent.submittedAt || agent.createdAt,
          status: agent.applicationStatus || "DRAFT",
          kyctype: "agent",
          data: agent,
        });
      });

      busOwners.forEach((owner) => {
        const docCount =
          (owner.companyRegistration?.documentUrls?.length || 0) +
          (owner.ownerIdentity?.documentUrls?.length || 0) +
          (owner.taxRegistration?.documentUrls?.length || 0) +
          (owner.bankDetails?.documentUrls?.length || 0);

        unifiedData.push({
          busownerId: owner.busOwnerId,
          companyname: owner.companyName || "N/A",
          owner: owner.user?.name || "Unknown",
          submitdate: owner.createdAt,
          status: owner.verificationStatus,
          kyctype: "busowner",
          documents: docCount,
          data: owner,
        });
      });

      fleets.forEach((fleet) => {
        unifiedData.push({
          fleetId: fleet.fleetId,
          companyname: fleet.brandId?.brandName || fleet.busName || "N/A",
          brandId: fleet.brandId?._id || null,
          owner: fleet.ownerId?.name || "Unknown",
          submitdate: fleet.createdAt,
          status: fleet.approvalStatus?.toLowerCase() || "pending",
          kyctype: "fleet",
          data: fleet,
        });
      });

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
      });
    }
  };
}

const getUnifiedKycList = createUnifiedKycListController();

module.exports = {
  getUnifiedKycList,
  createUnifiedKycListController,
};
