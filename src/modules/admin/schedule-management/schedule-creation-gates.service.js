"use strict";

const Fleet = require("../../../../models/fleetModel.js");
const OperatorBrand = require("../../../../models/operatorBrandModel.js");
const SeatTemplate = require("../../../../models/seatTemplateModel.js");

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
    .select("busName busNumber brandId ownerId approvalStatus status")
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

const validateSeatTemplate = async (seatTemplateId) => {
  if (!seatTemplateId) return;
  const template = await SeatTemplate.findById(seatTemplateId)
    .select("_id")
    .lean();
  if (!template) throw new Error("Seat template not found.");
};

module.exports = { validateBrand, validateFleet, validateSeatTemplate };
