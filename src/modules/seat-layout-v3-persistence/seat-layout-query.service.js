"use strict";

const { SeatLayoutPersistenceError } = require("./seat-layout-persistence.error");
const { templateDto, revisionDto, assignmentDto } = require("./seat-layout.dto");

function createSeatLayoutQueryService(repository) {
  async function listAdminTemplates(query = {}) {
    const filter = {};
    if (["PLATFORM", "OPERATOR"].includes(query.scope)) filter.scope = query.scope;
    if (["ACTIVE", "ARCHIVED"].includes(query.status)) filter.status = query.status;
    if (query.ownerId) filter.ownerId = query.ownerId;
    return (await repository.listTemplates(filter)).map(templateDto);
  }

  async function listOwnerTemplates(ownerId, { catalog = false } = {}) {
    const filter = catalog
      ? { scope: "PLATFORM", status: "ACTIVE", currentPublishedRevisionId: { $ne: null } }
      : { scope: "OPERATOR", ownerId, status: { $ne: "ARCHIVED" } };
    return (await repository.listTemplates(filter)).map(templateDto);
  }

  async function getTemplate(templateId, ownerId = null) {
    const filter = { _id: templateId };
    if (ownerId) filter.$or = [{ scope: "PLATFORM", status: "ACTIVE" }, { scope: "OPERATOR", ownerId }];
    const template = await repository.findTemplate(filter);
    if (!template) throw new SeatLayoutPersistenceError("SEAT_LAYOUT_TEMPLATE_NOT_FOUND", "Seat-layout template not found.", 404);
    const revisions = await repository.listRevisions(templateId);
    return { template: templateDto(template), revisions: revisions.map((item) => revisionDto(item, true)) };
  }

  async function getFleetAssignment(fleetId, ownerId = null) {
    const fleet = await repository.findFleet({ _id: fleetId, ...(ownerId ? { ownerId } : {}) });
    if (!fleet) throw new SeatLayoutPersistenceError("FLEET_NOT_FOUND", "Fleet not found.", 404);
    return {
      fleet: { id: String(fleet._id), name: fleet.busName, number: fleet.busNumber },
      assignment: assignmentDto(await repository.findAssignment(fleetId)),
    };
  }

  async function listChangeRequests(query = {}) {
    const filter = {};
    if (query.fleetId) filter.fleetId = query.fleetId;
    if (["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(query.status)) filter.status = query.status;
    return repository.listChangeRequests(filter);
  }

  return { listAdminTemplates, listOwnerTemplates, getTemplate, getFleetAssignment, listChangeRequests };
}

module.exports = { createSeatLayoutQueryService };
