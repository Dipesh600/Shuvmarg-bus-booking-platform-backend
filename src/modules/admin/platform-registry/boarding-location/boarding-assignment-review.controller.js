"use strict";

const service = require("./boarding-assignment-review.service.js");

function sendError(res, error) {
  const status = error.statusCode || 500;
  return res.status(status).json({
    success: false,
    code: error.code || "BOARDING_ASSIGNMENT_REVIEW_FAILED",
    message: status === 500 ? "Unable to review the boarding assignment." : error.message,
  });
}

async function listBoardingAssignmentReviews(req, res) {
  try {
    const data = await service.listBoardingAssignmentReviews(req.query);
    return res.json({ success: true, results: data.length, data });
  } catch (error) { return sendError(res, error); }
}

async function reviewBoardingAssignment(req, res) {
  try {
    const data = await service.reviewBoardingAssignment(
      req.params.id, req.body, req.adminInfo?.id || req.admin?._id
    );
    return res.json({ success: true, message: "Assignment review saved.", data });
  } catch (error) { return sendError(res, error); }
}

module.exports = { listBoardingAssignmentReviews, reviewBoardingAssignment };
