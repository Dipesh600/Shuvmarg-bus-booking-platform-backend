"use strict";

const {
  patchDiscoveredStop,
  approveSession: approveDiscoverySession,
  rejectSession: rejectDiscoverySession,
} = require("./route-discovery-review.service.js");
const { publishSession: publishDiscovery } = require("./route-publication.service.js");
const { setDiscoveredStops: replaceStops } = require("./discovered-stop.service.js");

const sendError = (res, error, transitionConflict = false) => {
  const status = error.message.includes("not found")
    ? 404
    : transitionConflict && error.message.includes("transition")
      ? 409
      : 400;
  return res.status(status).json({ success: false, message: error.message });
};

const patchStop = async (req, res) => {
  try {
    const session = await patchDiscoveredStop(
      req.params.id,
      req.params.stopId,
      req.body,
      req.adminInfo?.id
    );
    res.status(200).json({
      success: true,
      message: "Discovered stop updated.",
      data: session,
    });
  } catch (error) {
    sendError(res, error);
  }
};

const approveSession = async (req, res) => {
  try {
    const session = await approveDiscoverySession(
      req.params.id,
      req.adminInfo?.id
    );
    res.status(200).json({
      success: true,
      message: "Discovery session approved.",
      data: session,
    });
  } catch (error) {
    sendError(res, error);
  }
};

const rejectSession = async (req, res) => {
  try {
    const session = await rejectDiscoverySession(
      req.params.id,
      req.adminInfo?.id
    );
    res.status(200).json({
      success: true,
      message: "Discovery session rejected.",
      data: session,
    });
  } catch (error) {
    sendError(res, error);
  }
};

const publishSession = async (req, res) => {
  try {
    const result = await publishDiscovery(
      req.params.id,
      req.body,
      req.adminInfo?.id
    );
    res.status(200).json({
      success: true,
      message:
        `Discovery published. RouteVariant ${result.variant.code} created ` +
        `with ${result.stopsCreated} stops.`,
      data: {
        variantId: result.variant._id,
        variantCode: result.variant.code,
        corridorId: result.corridor._id,
        stopsCreated: result.stopsCreated,
        sessionId: result.session._id,
      },
    });
  } catch (error) {
    sendError(res, error, true);
  }
};

const setDiscoveredStops = async (req, res) => {
  try {
    const session = await replaceStops(
      req.params.id,
      req.body.discoveredStops
    );
    res.status(200).json({
      success: true,
      message: "Discovered stops set.",
      data: session,
    });
  } catch (error) {
    sendError(res, error);
  }
};

module.exports = {
  patchStop,
  approveSession,
  rejectSession,
  publishSession,
  setDiscoveredStops,
};
