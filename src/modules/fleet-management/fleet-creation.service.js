"use strict";

const {
  parseCreationInput,
} = require("./fleet-creation.policy");
const {
  createFleetDocuments,
} = require("./fleet-storage.service");
const { FLEET_APPROVAL_STATUS } = require("../../contracts/status/fleet-approval.status");

function createFleetCreationService({
  Bus,
  RouteRequest,
  policy,
  storage,
  logger = console,
}) {
  async function createRouteRequest(ownerId, input) {
    if (!input.requestOriginCity || !input.requestDestinationCity) return null;
    const request = new RouteRequest({
      ownerId,
      originCity: input.requestOriginCity,
      destinationCity: input.requestDestinationCity,
      viaStops: input.requestViaStops,
      status: "PENDING",
    });
    return request.save();
  }

  async function createFleet(
    ownerId,
    fleetData,
    files,
    createdBy = "BUS_OWNER"
  ) {
    const input = parseCreationInput(fleetData);
    await policy.validateReferences(input);
    await policy.validateBrand(input.brandId, ownerId);
    const routeRequest = await createRouteRequest(ownerId, input);
    const fleetSkeleton = new Bus({
      ownerId,
      brandId: input.brandId,
      busName: input.busName,
      busNumber: input.busNumber,
      busType: input.busType,
      totalSeats: input.totalSeats,
      seatConfig: input.seatConfig,
      vehicleType: input.vehicleType,
      registrationYear: input.registrationYear,
      amenitiesId: input.amenitiesId || null,
      amenityIds: input.amenityIds,
      boardingPointId: input.boardingPointId || null,
      corridorId: input.corridorId || null,
      routeRequestId: routeRequest?._id || null,
      fleetImages: [],
      fleetDocuments: createFleetDocuments(input),
      status: "INACTIVE",
      approvalStatus: FLEET_APPROVAL_STATUS.DRAFT,
      isApproved: false,
      setupComplete: false,
      submittedAt: null,
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
      createdBy,
    });
    const savedFleet = await fleetSkeleton.save();
    const uploadedKeys = [];
    try {
      const assets = await storage.uploadCreationAssets(
        savedFleet, input, files, uploadedKeys
      );
      savedFleet.fleetImages = assets.fleetImages;
      savedFleet.fleetDocuments = assets.fleetDocuments;
      const fleet = await savedFleet.save();
      if (routeRequest) {
        await RouteRequest.findByIdAndUpdate(routeRequest._id, {
          fleetId: fleet._id,
        });
      }
      return fleet;
    } catch (error) {
      logger.error(
        "[createFleet] Upload/save failed. Cleaning up S3 orphans and skeleton fleet.",
        error.message
      );
      if (uploadedKeys.length > 0) {
        await storage.deleteFromS3(uploadedKeys);
      }
      await Bus.findByIdAndDelete(savedFleet._id).catch(() => {});
      throw error;
    }
  }

  return { createFleet };
}

module.exports = { createFleetCreationService };
