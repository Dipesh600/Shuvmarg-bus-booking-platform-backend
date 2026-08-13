"use strict";

const { sendSeatLayoutError } = require("./seat-layout-api.error");
const { requiredBodyId } = require("./seat-layout-api.validation");
const { templateDto, revisionDto, assignmentDto, changeRequestDto } = require("./seat-layout.dto");

const adminActor = (req) => ({ id: req.adminInfo?.id, type: req.adminInfo?.role });

function createAdminSeatLayoutController(services, logger = console) {
  const attempt = (handler) => async (req, res) => {
    try { return await handler(req, res); } catch (error) { return sendSeatLayoutError(res, error, logger); }
  };
  return {
    listTemplates: attempt(async (req, res) => res.json({
      success: true, data: await services.query.listAdminTemplates(req.query),
    })),
    getTemplate: attempt(async (req, res) => res.json({
      success: true, data: await services.query.getTemplate(req.params.templateId),
    })),
    createPlatformTemplate: attempt(async (req, res) => {
      const value = await services.templates.createTemplate({
        ...req.body, scope: "PLATFORM", ownerId: null,
      }, adminActor(req));
      return res.status(201).json({ success: true, data: templateDto(value) });
    }),
    adoptForOperator: attempt(async (req, res) => {
      const value = await services.templates.adoptPlatformTemplate(
        req.params.templateId, req.body, adminActor(req)
      );
      return res.status(201).json({
        success: true, data: { template: templateDto(value.template), revision: revisionDto(value.revision, true) },
      });
    }),
    createRevision: attempt(async (req, res) => {
      const value = await services.templates.createRevision(
        req.params.templateId, req.body, adminActor(req)
      );
      return res.status(201).json({ success: true, data: revisionDto(value, true) });
    }),
    submitRevision: attempt(async (req, res) => res.json({
      success: true, data: revisionDto(await services.templates.submitRevision(
        req.params.templateId, req.params.revisionId, adminActor(req)
      ), true),
    })),
    publishRevision: attempt(async (req, res) => res.json({
      success: true, data: revisionDto(await services.templates.publishRevision(
        req.params.templateId, req.params.revisionId, adminActor(req)
      ), true),
    })),
    getFleetAssignment: attempt(async (req, res) => res.json({
      success: true, data: await services.query.getFleetAssignment(req.params.fleetId),
    })),
    assignInitial: attempt(async (req, res) => res.status(201).json({
      success: true, data: assignmentDto(await services.fleets.assignInitial(
        req.params.fleetId, requiredBodyId(req, "revisionId"), adminActor(req)
      )),
    })),
    createInitialCustomLayout: attempt(async (req, res) => {
      const value = await services.fleets.createInitialCustomLayout(
        req.params.fleetId, req.body, adminActor(req)
      );
      return res.status(201).json({ success: true, data: {
        assignment: assignmentDto(value.assignment),
        template: templateDto(value.template),
        revision: revisionDto(value.revision, true),
      } });
    }),
    listChangeRequests: attempt(async (req, res) => res.json({
      success: true, data: (await services.query.listChangeRequests(req.query)).map(changeRequestDto),
    })),
    approveChange: attempt(async (req, res) => res.json({
      success: true, data: assignmentDto(await services.fleets.approveChange(
        req.params.requestId, adminActor(req)
      )),
    })),
    rejectChange: attempt(async (req, res) => res.json({
      success: true, data: changeRequestDto(await services.fleets.rejectChange(
        req.params.requestId, req.body?.note, adminActor(req)
      )),
    })),
  };
}

module.exports = { createAdminSeatLayoutController };
