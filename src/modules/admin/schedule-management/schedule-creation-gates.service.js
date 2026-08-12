"use strict";

const Fleet = require("../../../../models/fleetModel.js");
const OperatorBrand = require("../../../../models/operatorBrandModel.js");
const SeatTemplate = require("../../../../models/seatTemplateModel.js");
const SeatLayoutVersion = require("../../../../models/seatLayoutVersionModel.js");

const validateBrand = async (brandId) => {
  const brand = await OperatorBrand.findById(brandId)
    .select("status brandName ownerId")
    .lean();
  if (!brand) throw new Error("Brand not found.");
  if (brand.status === "SUSPENDED") {
    throw new Error(
      `Brand "${brand.brandName}" is SUSPENDED. Reinstate the brand before creating schedules.`
    );
  }
  if (brand.status !== "ACTIVE") {
    throw new Error(
      `Brand "${brand.brandName}" is not ACTIVE (current: ${brand.status}). ` +
        "Only ACTIVE brands can run schedules."
    );
  }
  return brand;
};

const validateFleet = async (busId, brandId, brand) => {
  const fleet = await Fleet.findById(busId)
    .select("busName busNumber brandId ownerId approvalStatus status seatLayoutVersionId")
    .lean();
  if (!fleet) throw new Error("Fleet (bus) not found.");
  if (fleet.brandId?.toString() !== brandId.toString()) {
    throw new Error(
      `Bus "${fleet.busNumber}" does not belong to brand "${brand.brandName}". ` +
        "A schedule must use a bus assigned to the same brand."
    );
  }
  if (fleet.approvalStatus !== "APPROVED") {
    throw new Error(
      `Bus "${fleet.busName} (${fleet.busNumber})" is not APPROVED ` +
        `(status: ${fleet.approvalStatus}). Approve the vehicle before scheduling.`
    );
  }
  if (fleet.status !== "ACTIVE") {
    throw new Error(
      `Bus "${fleet.busName} (${fleet.busNumber})" is not ACTIVE ` +
        `(status: ${fleet.status}). Set the vehicle to ACTIVE before scheduling.`
    );
  }
  return fleet;
};

const validateSeatTemplate = async (seatTemplateId, ownerId = null) => {
  if (!seatTemplateId) return;
  const template = await SeatTemplate.findOne({
    _id: seatTemplateId,
    isActive: true,
  })
    .select("_id isActive scope userId currentVersionId")
    .lean();
  if (!template) throw new Error("Seat template is missing or inactive.");
  if (ownerId && template.scope !== "GLOBAL" && template.userId?.toString() !== ownerId.toString()) {
    throw new Error("Seat template does not belong to this operator.");
  }
  return template;
};

const validateSeatLayoutVersion = async (versionId, ownerId = null, templateId = null) => {
  if (!versionId) return;
  const version = await SeatLayoutVersion.findById(versionId)
    .select("_id templateId").lean();
  if (!version) throw new Error("Seat layout version not found.");
  if (templateId && version.templateId.toString() !== templateId.toString()) {
    throw new Error("Seat layout version does not belong to the selected template.");
  }
  await validateSeatTemplate(version.templateId, ownerId);
  return version;
};

module.exports = {
  validateBrand, validateFleet, validateSeatTemplate, validateSeatLayoutVersion,
};
