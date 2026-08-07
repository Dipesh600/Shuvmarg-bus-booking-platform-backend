"use strict";

const BusOwnerModel = require("../../../../models/busOwnerModel");
const BusModel = require("../../../../models/fleetModel");
const { FLEET_APPROVAL_STATUS } = require("../../../contracts/status/fleet-approval.status");

function createFleetDocumentRepository(deps = {}) {
  const Bus = deps.Bus || BusModel;
  const BusOwner = deps.BusOwner || BusOwnerModel;

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
      projection.fleetImages = 1;
    } else {
      projection[`fleetDocuments.${slot}`] = 1;
    }

    const doc = await Bus.findById(fleetId)
      .select(projection)
      .select(`+fleetDocuments.${slot}.objectKey +fleetImages.objectKey`)
      .lean();

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
    return Bus.findById(fleetId)
      .select("_id ownerId approvalStatus fleetDocuments fleetImages documentReviews")
      .select("+fleetDocuments.fitnessCert.objectKey +fleetDocuments.insurance.objectKey +fleetDocuments.bluebook.objectKey +fleetDocuments.routePermit.objectKey +fleetImages.objectKey")
      .lean();
  }

  return {
    findBusOwnerForActor,
    findFleetForDocumentUpdate,
    atomicDocumentUpdate,
    findFleetForRead,
  };
}

module.exports = createFleetDocumentRepository;
