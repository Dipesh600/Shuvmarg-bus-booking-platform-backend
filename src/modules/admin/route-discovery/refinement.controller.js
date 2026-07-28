"use strict";

const RouteDiscovery = require("../../../../models/routeDiscoveryModel.js");
const { refineStopsWithLLM: refineStops } = require("./stop-refinement.service.js");

const validateRefinement = (session) => {
  if (!session) return { status: 404, message: "Discovery session not found." };
  if (!["STOPS_DISCOVERED", "APPROVED"].includes(session.status)) {
    return {
      status: 400,
      message:
        "Stops can only be refined when in STOPS_DISCOVERED or APPROVED status.",
    };
  }
  if (session.discoveredStops.length === 0) {
    return { status: 400, message: "No stops to refine." };
  }
  if (session.llmJobStatus === "PROCESSING") {
    return {
      status: 409,
      message: "A refinement job is already running for this session.",
    };
  }
  return null;
};

const refineStopsWithLLM = async (req, res) => {
  const session = await RouteDiscovery.findById(req.params.id);
  const invalid = validateRefinement(session);
  if (invalid) {
    return res
      .status(invalid.status)
      .json({ success: false, message: invalid.message });
  }
  session.llmJobStatus = "PROCESSING";
  session.llmJobError = null;
  await session.save();
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const send = (data) => {
    if (!res.writableEnded) {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (_) {}
    }
  };
  setImmediate(async () => {
    try {
      await refineStops(
        req.params.id,
        req.adminInfo?.id,
        (text) => send({ text })
      );
      await RouteDiscovery.findByIdAndUpdate(req.params.id, {
        llmJobStatus: "DONE",
        llmJobError: null,
      });
      send({ complete: true });
      if (!res.writableEnded) res.end();
    } catch (error) {
      console.error("[RefineJob] Failed:", error.message);
      await RouteDiscovery.findByIdAndUpdate(req.params.id, {
        llmJobStatus: "FAILED",
        llmJobError: error.message,
      });
      send({ error: true, message: error.message });
      if (!res.writableEnded) res.end();
    }
  });
};

module.exports = { refineStopsWithLLM };
