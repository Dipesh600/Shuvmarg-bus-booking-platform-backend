"use strict";
const mongoose = require("mongoose");
const Fleet = require("../../../../models/fleetModel");
const FleetRouteSetup = require("../../../../models/fleetRouteSetupModel");
const BusOwner = require("../../../../models/busOwnerModel");
const FleetSeatLayoutAssignment = require("../../../../models/fleetSeatLayoutAssignmentModel");
const SeatLayoutRevision = require("../../../../models/seatLayoutRevisionModel");
const { ReadContractValidationError, ReadContractNotFoundError } = require("../common/read-errors");
const { mapAdminFleetListItem } = require("./admin-fleet-list.dto");
const { mapAdminFleetDetail } = require("./admin-fleet-detail.dto");
const { mapBusOwnerFleetListItem } = require("./bus-owner-fleet-list.dto");
const { mapBusOwnerFleetDetail } = require("./bus-owner-fleet-detail.dto");
const { buildAdminFleetFilter } = require("./fleet-read-filter.builder");
function createFleetReadRepository({ FleetModel = Fleet,
  BusOwnerModel = BusOwner,
  FleetRouteSetupModel = FleetRouteSetup,
  FleetSeatLayoutAssignmentModel = FleetSeatLayoutAssignment,
  SeatLayoutRevisionModel = SeatLayoutRevision,
} = {}) { async function loadSeatLayout(fleetId) { try { const assignment = await FleetSeatLayoutAssignmentModel.findOne({ fleetId }).lean();
      if (!assignment) return {};
      const revision = await SeatLayoutRevisionModel.findById(assignment.activeRevisionId).lean();
      return { assignment, revision };
    } catch (error) { console.warn("Could not load seat layout for fleet:", error?.message);
      return {};
    }
  }
  async function resolveOwnerObjectIds(userId) { if (!userId || typeof userId !== "string" || !mongoose.Types.ObjectId.isValid(userId)) { throw new ReadContractValidationError("READ_INVALID_FILTER", "Invalid ownerId filter.");
    }
    const owner = await BusOwnerModel.findOne({ $or: [{ _id: userId }, { user: userId }] }).select("_id user").lean();
    const ids = [userId];
    if (owner?._id) ids.push(owner._id);
    if (owner?.user) ids.push(owner.user);
    return ids;
  }
  async function findAdminPaginatedFleets(params) { const { page, limit, skip, ownerId } = params;
    const ownerIds = ownerId ? await resolveOwnerObjectIds(ownerId) : [];
    const filter = buildAdminFleetFilter(params, ownerIds);
    let rawFleets, totalItems;
    try { [rawFleets, totalItems] = await Promise.all([
        FleetModel.find(filter)
          .populate({ path: "ownerId", select: "name email phone", options: { strictPopulate: false } })
          .populate({ path: "brandId", select: "brandName brandCode ownerId", options: { strictPopulate: false } })
          .populate({ path: "approvedBy", select: "name email", options: { strictPopulate: false } })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        FleetModel.countDocuments(filter),
      ]);
    } catch (populateError) { console.error("Fleet list populate failed, falling back to unpopulated query:", populateError?.message);
      [rawFleets, totalItems] = await Promise.all([
        FleetModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        FleetModel.countDocuments(filter),
      ]);
    }
    const items = rawFleets.map(mapAdminFleetListItem).filter(Boolean);
    return { items, totalItems };
  }
  async function findAdminFleetDetailById(id) { let fleet;
    try { fleet = await FleetModel.findById(id)
        .select("+fleetImages.objectKey +fleetImages.mimeType +fleetDocuments.fitnessCert.objectKey +fleetDocuments.fitnessCert.mimeType +fleetDocuments.insurance.objectKey +fleetDocuments.insurance.mimeType +fleetDocuments.bluebook.objectKey +fleetDocuments.bluebook.mimeType +fleetDocuments.routePermit.objectKey +fleetDocuments.routePermit.mimeType")
        .populate({ path: "ownerId", select: "name email phone", options: { strictPopulate: false } })
        .populate({ path: "brandId", select: "brandName brandCode ownerId logo baseCity status", options: { strictPopulate: false } })
        .populate({ path: "corridorId",
          select: "code originId destinationId status",
          populate: [
            { path: "originId", select: "name city code", options: { strictPopulate: false } },
            { path: "destinationId", select: "name city code", options: { strictPopulate: false } },
          ],
          options: { strictPopulate: false },
        })
        .populate({ path: "routeRequestId", select: "originCity destinationCity viaStops status", options: { strictPopulate: false } })
        .populate({ path: "approvedBy", select: "name email", options: { strictPopulate: false } })
        .populate({ path: "rejectedBy", select: "name email", options: { strictPopulate: false } })
        .lean();
    } catch (populateError) { console.error("Fleet detail populate failed, falling back:", populateError?.message);
      fleet = await FleetModel.findById(id).select("+fleetImages.objectKey +fleetImages.mimeType +fleetDocuments.fitnessCert.objectKey +fleetDocuments.fitnessCert.mimeType +fleetDocuments.insurance.objectKey +fleetDocuments.insurance.mimeType +fleetDocuments.bluebook.objectKey +fleetDocuments.bluebook.mimeType +fleetDocuments.routePermit.objectKey +fleetDocuments.routePermit.mimeType").lean();
    }
    if (!fleet) { throw new ReadContractNotFoundError("FLEET_NOT_FOUND", "Fleet record not found.");
    }
    let routeSetup = null;
    try { routeSetup = await FleetRouteSetupModel.findOne({ fleetId: id })
        .populate({ path: "servedStops.stopId", select: "name city code", options: { strictPopulate: false } })
        .populate({ path: "originStopId", select: "name city", options: { strictPopulate: false } })
        .populate({ path: "destinationStopId", select: "name city", options: { strictPopulate: false } })
        .lean();
    } catch (err) { console.warn("Could not load route setup for fleet:", err?.message);
    }
    const seatLayout = await loadSeatLayout(id);
    return mapAdminFleetDetail(fleet, routeSetup, seatLayout);
  }
  async function findOwnerPaginatedFleets({ userId, page, limit, skip }) { const ownerIds = await resolveOwnerObjectIds(userId);
    const filter = { $or: [{ ownerId: { $in: ownerIds } }, { busOwnerId: { $in: ownerIds } }],
    };
    const [rawFleets, totalItems] = await Promise.all([
      FleetModel.find(filter)
        .select("+fleetImages.objectKey +fleetImages.mimeType +fleetDocuments.fitnessCert.objectKey +fleetDocuments.fitnessCert.mimeType +fleetDocuments.insurance.objectKey +fleetDocuments.insurance.mimeType +fleetDocuments.bluebook.objectKey +fleetDocuments.bluebook.mimeType +fleetDocuments.routePermit.objectKey +fleetDocuments.routePermit.mimeType")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      FleetModel.countDocuments(filter),
    ]);
    const items = rawFleets.map(mapBusOwnerFleetListItem).filter(Boolean);
    return { items, totalItems };
  }
  async function findOwnerFleetDetailById({ fleetId, userId }) { const ownerIds = await resolveOwnerObjectIds(userId);
    const fleet = await FleetModel.findOne({ _id: fleetId,
      $or: [{ ownerId: { $in: ownerIds } }, { busOwnerId: { $in: ownerIds } }],
    }).select("+fleetImages.objectKey +fleetImages.mimeType +fleetDocuments.fitnessCert.objectKey +fleetDocuments.fitnessCert.mimeType +fleetDocuments.insurance.objectKey +fleetDocuments.insurance.mimeType +fleetDocuments.bluebook.objectKey +fleetDocuments.bluebook.mimeType +fleetDocuments.routePermit.objectKey +fleetDocuments.routePermit.mimeType").lean();
    if (!fleet) { throw new ReadContractNotFoundError("FLEET_NOT_FOUND", "Fleet record not found or not owned by user.");
    }
    let routeSetup = null;
    try { routeSetup = await FleetRouteSetupModel.findOne({ fleetId })
        .populate({ path: "servedStops.stopId", select: "name city code", options: { strictPopulate: false } })
        .populate({ path: "originStopId", select: "name city", options: { strictPopulate: false } })
        .populate({ path: "destinationStopId", select: "name city", options: { strictPopulate: false } })
        .lean();
    } catch (err) { console.warn("Could not load route setup for owner fleet detail:", err?.message);
    }
    const seatLayout = await loadSeatLayout(fleetId);
    return mapBusOwnerFleetDetail(fleet, routeSetup, seatLayout);
  }
  return { findAdminPaginatedFleets,
    findAdminFleetDetailById,
    findOwnerPaginatedFleets,
    findOwnerFleetDetailById,
  };
}
module.exports = { createFleetReadRepository,
};
