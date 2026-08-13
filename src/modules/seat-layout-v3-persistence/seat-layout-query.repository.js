"use strict";

const Template = require("../../../models/seatLayoutTemplateModel");
const Revision = require("../../../models/seatLayoutRevisionModel");
const Fleet = require("../../../models/fleetModel");
const Assignment = require("../../../models/fleetSeatLayoutAssignmentModel");
const ChangeRequest = require("../../../models/fleetSeatLayoutChangeRequestModel");

const listTemplates = (filter) => Template.find(filter).sort({ updatedAt: -1 }).lean();
const findTemplate = (filter) => Template.findOne(filter).lean();
const listRevisions = (templateId) => Revision.find({ templateId }).sort({ revisionNumber: -1 }).lean();
const findFleet = (filter) => Fleet.findOne(filter).select("_id ownerId busName busNumber").lean();
const findAssignment = (fleetId) => Assignment.findOne({ fleetId })
  .populate("templateId", "templateCode name scope status")
  .populate("activeRevisionId", "revisionNumber status physicalFingerprint totalPlaces")
  .lean();
const listChangeRequests = (filter) => ChangeRequest.find(filter).sort({ createdAt: -1 }).lean();

module.exports = {
  listTemplates, findTemplate, listRevisions, findFleet, findAssignment, listChangeRequests,
};
