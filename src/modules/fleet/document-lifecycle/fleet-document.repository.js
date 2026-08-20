"use strict";

const mongoose = require("mongoose");
const BusOwnerModel = require("../../../../models/busOwnerModel");
const BusModel = require("../../../../models/fleetModel");
const { FLEET_APPROVAL_STATUS } = require("../../../contracts/status/fleet-approval.status");

function createFleetDocumentRepository(deps = {}) {
  const Bus = deps.Bus || BusModel;
  const BusOwner = deps.BusOwner || BusOwnerModel;

  async function findRawFleetById(fleetId, projection) {
    if (Bus.collection && typeof Bus.collection.findOne === "function") {
      return Bus.collection.findOne(
        { _id: new mongoose.Types.ObjectId(String(fleetId)) },
        { projection }
      );
    }
    return null;
  }

  async function findBusOwnerForActor(userId) {
    return BusOwner.findOne({ user: userId }).select("_id verificationStatus").lean();
  }

  async function findFleetForDocumentUpdate({ fleetId, slot }) {
    const projection = {
      _id: 1,
      ownerId: 1,
      approvalStatus: 1,
      status: 1,
      __v: 1,
      [`documentReviews.${slot}`]: 1,
    };

    if (slot === "fleetImages") {
      projection["fleetImages.imageId"] = 1;
      projection["fleetImages.view"] = 1;
      projection["fleetImages.objectKey"] = 1;
      projection["fleetImages.mimeType"] = 1;
      projection["fleetImages.size"] = 1;
      projection["fleetImages.uploadedAt"] = 1;
    } else {
      projection[`fleetDocuments.${slot}.url`] = 1;
      projection[`fleetDocuments.${slot}.objectKey`] = 1;
      projection[`fleetDocuments.${slot}.mimeType`] = 1;
      projection[`fleetDocuments.${slot}.size`] = 1;
      projection[`fleetDocuments.${slot}.uploadedAt`] = 1;
      projection[`fleetDocuments.${slot}.validTill`] = 1;
      projection[`fleetDocuments.${slot}.policyNumber`] = 1;
    }

    const rawDoc = await findRawFleetById(fleetId, projection);
    const doc = rawDoc || await Bus.findById(fleetId).select(projection).lean();

    return doc;
  }

  async function atomicDocumentUpdate({ fleetId, expectedVersion, update }) {
    return Bus.findOneAndUpdate(
      {
        _id: fleetId,
        __v: expectedVersion,
        approvalStatus: {
          $in: [FLEET_APPROVAL_STATUS.DRAFT, FLEET_APPROVAL_STATUS.REJECTED],
        },
      },
      update,
      { new: true, runValidators: true }
    ).lean();
  }

  async function findFleetForRead(fleetId) {
    const projection = {
      _id: 1,
      ownerId: 1,
      approvalStatus: 1,
      documentReviews: 1,
      fleetImages: 1,
      fleetDocuments: 1,
    };
    const rawDoc = await findRawFleetById(fleetId, projection);
    if (rawDoc) return rawDoc;
    return Bus.findById(fleetId).schemaLevelProjections(false).select(projection).lean();
  }

  return {
    findBusOwnerForActor,
    findFleetForDocumentUpdate,
    atomicDocumentUpdate,
    findFleetForRead,
  };
}

module.exports = createFleetDocumentRepository;
