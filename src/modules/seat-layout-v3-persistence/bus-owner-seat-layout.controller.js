"use strict";

const { sendSeatLayoutError } = require("./seat-layout-api.error");
const { requiredBodyId } = require("./seat-layout-api.validation");
const { templateDto, revisionDto, assignmentDto, changeRequestDto } = require("./seat-layout.dto");

const ownerActor = (req) => ({ id: req.userInfo?.id, type: "BUS_OWNER" });

function createBusOwnerSeatLayoutController(services, logger = console) {
  const attempt = (handler) => async (req, res) => {
    try { return await handler(req, res); } catch (error) { return sendSeatLayoutError(res, error, logger); }
  };
  return {
    listCatalog: attempt(async (req, res) => res.json({
      success: true, data: await services.query.listOwnerTemplates(req.userInfo?.id, { catalog: true }),
    })),
    listMyTemplates: attempt(async (req, res) => res.json({
      success: true, data: await services.query.listOwnerTemplates(req.userInfo?.id),
    })),
    getTemplate: attempt(async (req, res) => res.json({
      success: true, data: await services.query.getTemplate(req.params.templateId, req.userInfo?.id),
    })),
    adoptPlatformTemplate: attempt(async (req, res) => {
      const value = await services.templates.adoptPlatformTemplate(req.params.templateId, {
        ...req.body, ownerId: req.userInfo?.id,
      }, ownerActor(req));
      return res.status(201).json({
        success: true, data: { template: templateDto(value.template), revision: revisionDto(value.revision, true) },
      });
    }),
    createRevision: attempt(async (req, res) => res.status(201).json({
      success: true, data: revisionDto(await services.templates.createRevision(
        req.params.templateId, req.body, ownerActor(req)
      ), true),
    })),
    submitRevision: attempt(async (req, res) => res.json({
      success: true, data: revisionDto(await services.templates.submitRevision(
        req.params.templateId, req.params.revisionId, ownerActor(req)
      ), true),
    })),
    getFleetAssignment: attempt(async (req, res) => res.json({
      success: true, data: await services.query.getFleetAssignment(req.params.fleetId, req.userInfo?.id),
    })),
    assignInitial: attempt(async (req, res) => res.status(201).json({
      success: true, data: assignmentDto(await services.fleets.assignInitial(
        req.params.fleetId, requiredBodyId(req, "revisionId"), ownerActor(req)
      )),
    })),
    createInitialCustomLayout: attempt(async (req, res) => {
      const value = await services.fleets.createInitialCustomLayout(
        req.params.fleetId, req.body, ownerActor(req)
      );
      return res.status(201).json({ success: true, data: {
        assignment: assignmentDto(value.assignment),
        template: templateDto(value.template),
        revision: revisionDto(value.revision, true),
      } });
    }),
    requestChange: attempt(async (req, res) => res.status(202).json({
      success: true, data: changeRequestDto(await services.fleets.requestChange(
        req.params.fleetId, requiredBodyId(req, "proposedRevisionId"), ownerActor(req)
      )),
    })),
    correctRejectedLayout: attempt(async (req, res) => res.json({
      success: true, data: assignmentDto(await services.fleets.correctRejectedLayout(
        req.params.fleetId, requiredBodyId(req, "proposedRevisionId"), ownerActor(req)
      )),
    })),
  };
}

module.exports = { createBusOwnerSeatLayoutController };
