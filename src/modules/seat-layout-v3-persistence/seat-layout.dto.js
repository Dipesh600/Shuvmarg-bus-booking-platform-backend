"use strict";

function id(value) {
  return value?._id ? String(value._id) : value ? String(value) : null;
}

function templateDto(value) {
  return {
    id: id(value), templateCode: value.templateCode, name: value.name,
    scope: value.scope, ownerId: id(value.ownerId), sourceTemplateId: id(value.sourceTemplateId),
    vehicleCategory: value.vehicleCategory, status: value.status,
    currentPublishedRevisionId: id(value.currentPublishedRevisionId),
    createdAt: value.createdAt, updatedAt: value.updatedAt,
  };
}

function revisionDto(value, includeLayout = false) {
  return {
    id: id(value), templateId: id(value.templateId), revisionNumber: value.revisionNumber,
    baseRevisionId: id(value.baseRevisionId), sourceRevisionId: id(value.sourceRevisionId),
    status: value.status, physicalFingerprint: value.physicalFingerprint,
    totalPlaces: value.totalPlaces, changeSummary: value.changeSummary,
    publishedAt: value.publishedAt, createdAt: value.createdAt,
    ...(includeLayout ? { layout: value.layout } : {}),
  };
}

function assignmentDto(value) {
  if (!value) return null;
  return {
    id: id(value), fleetId: id(value.fleetId), assignmentVersion: value.assignmentVersion,
    assignedAt: value.assignedAt,
    template: value.templateId?._id ? templateDto(value.templateId) : { id: id(value.templateId) },
    activeRevision: value.activeRevisionId?._id
      ? revisionDto(value.activeRevisionId) : { id: id(value.activeRevisionId) },
  };
}

function changeRequestDto(value) {
  return {
    id: id(value), fleetId: id(value.fleetId), assignmentId: id(value.assignmentId),
    fromRevisionId: id(value.fromRevisionId), proposedRevisionId: id(value.proposedRevisionId),
    status: value.status, requestedAt: value.requestedAt,
    reviewedAt: value.reviewedAt, reviewNote: value.reviewNote,
  };
}

module.exports = { templateDto, revisionDto, assignmentDto, changeRequestDto };
