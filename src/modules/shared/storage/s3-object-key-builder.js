"use strict";

const sanitizeSegment = (str) => {
  if (!str) return "unknown";

  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
};

const buildS3Path = ({
  type,
  ownerId,
  brandId,
  fleetId,
  driverId,
  agentId,
  documentType,
  disputeType,
  transactionId,
}) => {
  const ownerSegment = `owners/${sanitizeSegment(ownerId)}`;

  switch (type) {
    case "owner_kyc":
      return `${ownerSegment}/kyc/${sanitizeSegment(documentType)}`;

    case "fleet_images":
      return `${ownerSegment}/brands/${sanitizeSegment(
        brandId || "no-brand"
      )}/fleets/${sanitizeSegment(fleetId)}/images`;

    case "fleet_docs":
      return `${ownerSegment}/brands/${sanitizeSegment(
        brandId || "no-brand"
      )}/fleets/${sanitizeSegment(fleetId)}/docs/${sanitizeSegment(
        documentType
      )}`;

    case "driver_docs":
      return `brands/${sanitizeSegment(brandId)}/drivers/${sanitizeSegment(
        driverId
      )}/docs/${sanitizeSegment(documentType)}`;

    case "agent_kyc":
      return `agents/${sanitizeSegment(agentId)}/kyc/${sanitizeSegment(
        documentType
      )}`;

    case "dispute_proof":
      return `disputes/${sanitizeSegment(
        disputeType || "general"
      )}/${sanitizeSegment(transactionId)}`;

    case "scratch_theme":
      return "platform/scratch-themes";

    case "coupon_image":
      return "platform/coupons";

    default:
      return `misc/${sanitizeSegment(type)}`;
  }
};

module.exports = {
  sanitizeSegment,
  buildS3Path,
};
