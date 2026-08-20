"use strict";

const workflow = require("./variant-draft-workflow.service.js");
function sendError(res, error) {
  if (!error?.code || !Number.isInteger(error.statusCode)) {
    console.error("[variant-draft-workflow] unexpected error", error);
    return res.status(500).json({
      success: false,
      code: "VARIANT_DRAFT_INTERNAL_ERROR",
      message: "The route variant draft could not be updated. Try again shortly.",
    });
  }
  return res.status(error.statusCode || 400).json({
    success: false,
    ...(error.code && { code: error.code }),
    message: error.message || "The variant draft could not be updated.",
    ...(error.details !== undefined && { details: error.details }),
  });
}

function actorId(req) {
  return req.adminInfo?.id || null;
}

async function createVariantDraft(req, res) {
  try {
    const data = await workflow.createVariantDraft(
      req.params.corridorId, req.body, actorId(req)
    );
    return res.status(201).json({ success: true, message: "Variant draft created.", data });
  } catch (error) {
    return sendError(res, error);
  }
}

async function previewCorridorRoutePaths(req, res) {
  try {
    const data = await workflow.previewCorridorRoutePaths(
      req.params.corridorId, req.body || {}
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
}
async function getVariantDraft(req, res) {
  try {
    const data = await workflow.getVariantDraft(req.params.variantId, {
      includeRouteGeometry: req.query.includeRouteGeometry === "true",
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
}
async function refreshVariantDraftRouteOptions(req, res) {
  try {
    const data = await workflow.refreshVariantDraftRouteOptions(
      req.params.variantId, actorId(req), req.body || {}
    );
    return res.status(200).json({ success: true, message: "Road-route suggestions loaded.", data });
  } catch (error) {
    return sendError(res, error);
  }
}
async function searchVariantDraftGuidancePlaces(req, res) {
  try {
    const data = await workflow.searchVariantDraftGuidancePlaces(
      req.params.variantId, req.query.q
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
}
async function selectVariantDraftRouteOption(req, res) {
  try {
    const data = await workflow.selectVariantDraftRouteOption(
      req.params.variantId, req.body.routeOptionId || req.body.routeOptionKey
    );
    return res.status(200).json({ success: true, message: "Road-route suggestion selected.", data });
  } catch (error) {
    return sendError(res, error);
  }
}
async function updateVariantDraftDetails(req, res) {
  try {
    const data = await workflow.updateVariantDraftDetails(
      req.params.variantId, req.body, actorId(req)
    );
    return res.status(200).json({ success: true, message: "Variant details saved.", data });
  } catch (error) {
    return sendError(res, error);
  }
}
async function prepareVariantDraftStopCandidates(req, res) {
  try {
    const data = await workflow.prepareVariantDraftStopCandidates(req.params.variantId);
    return res.status(200).json({ success: true, message: "Stop candidates prepared for review.", data });
  } catch (error) {
    return sendError(res, error);
  }
}
async function updateVariantDraftCandidate(req, res) {
  try {
    const data = await workflow.updateVariantDraftCandidate(
      req.params.variantId, req.params.candidateId, req.body
    );
    return res.status(200).json({ success: true, message: "Stop candidate reviewed.", data });
  } catch (error) {
    return sendError(res, error);
  }
}
async function useAllMatchedVariantDraftCandidates(req, res) {
  try {
    const data = await workflow.useAllMatchedVariantDraftCandidates(req.params.variantId);
    return res.status(200).json({ success: true, message: "All safe existing Stop matches are selected.", data });
  } catch (error) {
    return sendError(res, error);
  }
}
async function addExistingVariantDraftStop(req, res) {
  try {
    const data = await workflow.addExistingStopCandidate(req.params.variantId, req.body.stopId);
    return res.status(200).json({ success: true, message: "Stop added and positioned on the selected road path.", data });
  } catch (error) {
    return sendError(res, error);
  }
}
async function commitVariantDraft(req, res) {
  try {
    const data = await workflow.commitVariantDraft(req.params.variantId, actorId(req));
    return res.status(200).json({ success: true, message: "Route stop sequence saved as a draft.", data });
  } catch (error) {
    return sendError(res, error);
  }
}

async function activateVariantDraft(req, res) {
  try {
    const data = await workflow.activateVariantDraft(req.params.variantId, actorId(req));
    return res.status(200).json({ success: true, message: "Route variant activated.", data });
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = {
  addExistingVariantDraftStop,
  activateVariantDraft,
  commitVariantDraft,
  createVariantDraft,
  getVariantDraft,
  prepareVariantDraftStopCandidates,
  previewCorridorRoutePaths,
  refreshVariantDraftRouteOptions,
  searchVariantDraftGuidancePlaces,
  selectVariantDraftRouteOption,
  updateVariantDraftCandidate,
  updateVariantDraftDetails,
  useAllMatchedVariantDraftCandidates,
};
