const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB.js");
const express = require("express");
const router = express.Router();
const auth = require("../../middleware/authMiddleware.js");
const {
  createReview,
  getReviewsForSchedule,
  getReviewsForBusNo,
  getReviewsForFleet,
  getMyReviews,
} = require("../../controllers/reviewController/reviewController.js");

// Create a review
router.post("/createReview", auth, verifyRoleFromDB, createReview);

// Public read endpoints
router.get("/schedule/:scheduleId", getReviewsForSchedule);
router.post("/bus", getReviewsForBusNo);
router.get("/fleet/:fleetId", getReviewsForFleet);

// My reviews
router.get("/mine", auth, verifyRoleFromDB, getMyReviews);

module.exports = router;
