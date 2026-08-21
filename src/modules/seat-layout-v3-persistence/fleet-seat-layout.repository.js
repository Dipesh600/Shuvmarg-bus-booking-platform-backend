"use strict";
const Fleet = require("../../../models/fleetModel");
const SeatLayoutTemplate = require("../../../models/seatLayoutTemplateModel");
const SeatLayoutRevision = require("../../../models/seatLayoutRevisionModel");
const Assignment = require("../../../models/fleetSeatLayoutAssignmentModel");
const ChangeRequest = require("../../../models/fleetSeatLayoutChangeRequestModel");
const SeatLayoutAuditEvent = require("../../../models/seatLayoutAuditEventModel");
const { SeatLayoutPersistenceError } = require("./seat-layout-persistence.error");
const findFleet = (id) => Fleet.findById(id)
  .select("ownerId approvalStatus documentReviews sectionReviews")
  .lean();
const findTemplate = (id) => SeatLayoutTemplate.findById(id).lean();
const findRevision = (id) => SeatLayoutRevision.findById(id).lean();
const findAssignment = (fleetId) => Assignment.findOne({ fleetId }).lean();
async function createInitialAssignment({ fleet, template, revision, actor }) {
  return Assignment.create({
    fleetId: fleet._id, templateId: template._id, activeRevisionId: revision._id,
    assignedByType: actor.type, assignedById: actor.id,
  });
}
async function createInitialCustomLayout({ fleet, sourceTemplate, name, layout, totalPlaces, physicalFingerprint, actor }) {
  const session = await Assignment.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const existing = await Assignment.findOne({ fleetId: fleet._id }).session(session);
      if (existing) throw new SeatLayoutPersistenceError("FLEET_LAYOUT_ALREADY_ASSIGNED", "This fleet already has a seat layout.", 409);
      const [template] = await SeatLayoutTemplate.create([{
        templateCode: `FLT-${String(fleet._id).toUpperCase()}`, name, scope: "OPERATOR",
        ownerId: fleet.ownerId, sourceTemplateId: sourceTemplate?._id || null,
        vehicleCategory: layout.vehicleCategory, revisionCounter: 1,
        createdByType: actor.type, createdById: actor.id,
      }], { session });
      const [revision] = await SeatLayoutRevision.create([{
        templateId: template._id, revisionNumber: 1, status: "PUBLISHED", layout,
        physicalFingerprint, totalPlaces, changeSummary: "Initial fleet layout",
        createdByType: actor.type, createdById: actor.id,
        publishedAt: new Date(), publishedById: actor.id,
      }], { session });
      template.currentPublishedRevisionId = revision._id;
      await template.save({ session });
      const [assignment] = await Assignment.create([{
        fleetId: fleet._id, templateId: template._id, activeRevisionId: revision._id,
        assignedByType: actor.type, assignedById: actor.id,
      }], { session });
      await SeatLayoutAuditEvent.create([{
        action: "INITIAL_FLEET_LAYOUT_CREATED", actorType: actor.type, actorId: actor.id,
        templateId: template._id, revisionId: revision._id, fleetId: fleet._id,
        metadata: { totalPlaces },
      }], { session });
      result = { template, revision, assignment };
    });
    return result;
  } finally { await session.endSession(); }
}
async function createChangeRequest({ fleet, assignment, revision, actor }) {
  const request = await ChangeRequest.create({
    fleetId: fleet._id, assignmentId: assignment._id,
    fromRevisionId: assignment.activeRevisionId, proposedRevisionId: revision._id,
    requestedByType: actor.type, requestedById: actor.id,
  });
  if (fleet.approvalStatus === "REJECTED") {
    await Fleet.updateOne({ _id: fleet._id }, { $set: {
      "sectionReviews.seatLayout": { status: "not_submitted", reason: null, reviewedBy: null, reviewedAt: null },
    } });
  }
  return request;
}
async function replaceRejectedAssignment({ fleet, assignment, revision, template, actor }) {
  const updated = await Assignment.findOneAndUpdate(
    { _id: assignment._id, fleetId: fleet._id, activeRevisionId: assignment.activeRevisionId },
    { $set: {
      templateId: template._id,
      activeRevisionId: revision._id,
      assignedByType: actor.type,
      assignedById: actor.id,
      assignedAt: new Date(),
    }, $inc: { assignmentVersion: 1 } },
    { new: true, runValidators: true }
  );
  if (!updated) throw new SeatLayoutPersistenceError("FLEET_LAYOUT_ASSIGNMENT_CHANGED", "The fleet layout changed while the correction was being saved.", 409);
  await Fleet.updateOne({ _id: fleet._id, approvalStatus: "REJECTED" }, { $set: {
    "sectionReviews.seatLayout": { status: "not_submitted", reason: null, reviewedBy: null, reviewedAt: null },
  } });
  return updated;
}
async function approveChangeRequest(requestId, actor) {
  const session = await Assignment.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const request = await ChangeRequest.findOne({ _id: requestId, status: "PENDING" }).session(session);
      if (!request) throw new SeatLayoutPersistenceError("FLEET_LAYOUT_REQUEST_NOT_PENDING", "Pending request not found.");
      const assignment = await Assignment.findOne({
        _id: request.assignmentId, activeRevisionId: request.fromRevisionId,
      }).session(session);
      if (!assignment) {
        throw new SeatLayoutPersistenceError(
          "FLEET_LAYOUT_ASSIGNMENT_CHANGED", "The fleet layout changed while this request was pending."
        );
      }
      const nextRevision = await SeatLayoutRevision.findById(request.proposedRevisionId)
        .select("templateId status").session(session);
      if (!nextRevision || nextRevision.status !== "PUBLISHED") {
        throw new SeatLayoutPersistenceError(
          "FLEET_LAYOUT_PROPOSED_REVISION_UNAVAILABLE",
          "The proposed revision is no longer published and cannot be activated."
        );
      }
      assignment.activeRevisionId = request.proposedRevisionId;
      assignment.templateId = nextRevision.templateId;
      assignment.assignmentVersion += 1;
      assignment.assignedAt = new Date();
      assignment.assignedByType = actor.type;
      assignment.assignedById = actor.id;
      await assignment.save({ session });
      request.status = "APPROVED";
      request.reviewedById = actor.id;
      request.reviewedAt = new Date();
      await request.save({ session });
      result = assignment;
    });
    return result;
  } finally {
    await session.endSession();
  }
}
async function rejectChangeRequest(requestId, note, actor) {
  const request = await ChangeRequest.findOneAndUpdate(
    { _id: requestId, status: "PENDING" },
    { $set: { status: "REJECTED", reviewNote: note || null, reviewedById: actor.id, reviewedAt: new Date() } },
    { new: true, runValidators: true }
  );
  if (!request) {
    throw new SeatLayoutPersistenceError("FLEET_LAYOUT_REQUEST_NOT_PENDING", "Pending request not found.");
  }
  return request;
}
module.exports = {
  findFleet, findTemplate, findRevision, findAssignment,
  createInitialAssignment, createInitialCustomLayout, createChangeRequest, replaceRejectedAssignment, approveChangeRequest, rejectChangeRequest,
};
