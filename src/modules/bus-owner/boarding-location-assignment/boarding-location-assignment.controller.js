"use strict";

function sendError(res, error, logger) {
  logger.error("boarding-location-assignment", {
    code: error.code, message: error.message,
  });
  return res.status(error.statusCode || 500).json({
    success: false,
    errorCode: error.code || "BOARDING_LOCATION_OPERATION_FAILED",
    message: error.statusCode ? error.message : "Unable to complete the boarding-location request.",
    ...(error.details === undefined ? {} : { details: error.details }),
  });
}

function createBoardingAssignmentController(services, logger = console) {
  const ownerId = (req) => req.userInfo?.id;
  return {
    async listBrands(req, res) {
      try {
        const data = await services.listOwnedOperatorBrands(ownerId(req));
        return res.json({ success: true, data });
      } catch (error) { return sendError(res, error, logger); }
    },
    async listCatalog(req, res) {
      try {
        const data = await services.listCanonicalBoardingLocations(ownerId(req), req.query);
        return res.json({ success: true, data });
      } catch (error) { return sendError(res, error, logger); }
    },
    async listRouteStops(req, res) {
      try {
        const data = await services.listOperationalRouteStops(ownerId(req), req.query);
        return res.json({ success: true, data });
      } catch (error) { return sendError(res, error, logger); }
    },
    async listAssignments(req, res) {
      try {
        const data = await services.listBoardingAssignments(ownerId(req), req.query);
        return res.json({ success: true, data });
      } catch (error) { return sendError(res, error, logger); }
    },
    async createAssignment(req, res) {
      try {
        const data = await services.createBoardingAssignment(ownerId(req), req.body);
        return res.status(201).json({ success: true, data });
      } catch (error) { return sendError(res, error, logger); }
    },
    async updateAssignment(req, res) {
      try {
        const data = await services.updateBoardingAssignment(
          ownerId(req), req.params.id, req.body
        );
        return res.json({ success: true, data });
      } catch (error) { return sendError(res, error, logger); }
    },
    async requestLocation(req, res) {
      try {
        const data = await services.requestBoardingLocation(ownerId(req), req.body);
        return res.status(202).json({
          success: true, message: "Boarding location submitted for platform review.", data,
        });
      } catch (error) { return sendError(res, error, logger); }
    },
  };
}

module.exports = { createBoardingAssignmentController };
