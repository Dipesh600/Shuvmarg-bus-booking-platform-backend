"use strict";

const { sendSeatLayoutError } = require("./seat-layout-api.error");

const actor = (req) => ({ id: req.userInfo?.id, type: "BUS_OWNER" });

function createTripSeatLayoutControlController(service, logger = console) {
  const attempt = (handler) => async (req, res) => {
    try { return await handler(req, res); } catch (error) { return sendSeatLayoutError(res, error, logger); }
  };
  return {
    get: attempt(async (req, res) => res.json({ success: true, data: await service.get(req.params.tripId, actor(req)) })),
    changePlaceState: attempt(async (req, res) => res.json({ success: true, data: await service.changePlaceState(req.params.tripId, req.params.elementId, req.body, actor(req)) })),
    changePricing: attempt(async (req, res) => res.json({ success: true, data: await service.changePricing(req.params.tripId, req.body, actor(req)) })),
  };
}

module.exports = { createTripSeatLayoutControlController };
