"use strict";

function sendError(res, error) {
  return res.status(error.statusCode || 500).json({
    success: false, errorCode: error.code || "FLEET_ROUTE_SETUP_FAILED",
    message: error.statusCode ? error.message : "Unable to load route setup.",
  });
}

function createFleetRouteCatalogController(service, boardingCatalog, routeSetup, reusableSetup) {
  return {
    async searchStops(req, res) {
      try {
        return res.json({
          success: true,
          data: await service.searchStops(req.query.q || "", req.query.purpose || "ENDPOINT"),
        });
      } catch (error) { return sendError(res, error); }
    },
    async listRouteOptions(req, res) {
      try {
        const data = await service.listRouteOptions(
          req.query.originStopId, req.query.destinationStopId
        );
        return res.json({ success: true, data });
      } catch (error) { return sendError(res, error); }
    },
    async listBoardingLocations(req, res) {
      try {
        return res.json({
          success: true, data: await boardingCatalog.listBoardingLocations(req.query.stopId),
        });
      } catch (error) { return sendError(res, error); }
    },
    async saveRouteSetup(req, res) {
      try {
        const data = await routeSetup.saveRouteSetup(
          req.userInfo?.id, req.params.fleetId, req.body
        );
        return res.json({ success: true, data });
      } catch (error) { return sendError(res, error); }
    },
    async getRouteSetup(req, res) {
      try {
        const data = await routeSetup.getRouteSetup(req.userInfo?.id, req.params.fleetId);
        return res.json({ success: true, data });
      } catch (error) { return sendError(res, error); }
    },
    async getReusableSetup(req, res) {
      try {
        const data = await reusableSetup.getReusableSetup(req.userInfo?.id, req.query);
        return res.json({ success: true, data });
      } catch (error) { return sendError(res, error); }
    },
  };
}

module.exports = { createFleetRouteCatalogController };
