const mongoose = require("mongoose");
const Review = require("../../models/reviewModel.js");
const Booking = require("../../models/bookTicketModel.js");
const Trip = require("../../models/tripModel.js");
const Bus = require("../../models/fleetModel.js");

// Parse time like "06:15 AM" into minutes since midnight
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let [_, hh, mm, ap] = match;
  let h = parseInt(hh, 10) % 12;
  if (ap.toUpperCase() === "PM") h += 12;
  return h * 60 + parseInt(mm, 10);
}

// Determine if a schedule is completed relative to now
function isScheduleCompleted(schedule) {
  try {
    const now = new Date();
    const [y, m, d] = schedule.date
      .split(/[-/]/)
      .map((x) => parseInt(x, 10));
    // Support formats like YYYY-MM-DD or DD-MM-YYYY by heuristics
    let year = y;
    let month = m;
    let day = d;
    if (y < 100) {
      // unlikely, fallback to current year
      year = now.getFullYear();
    }
    // Heuristic: if first token is > 31, assume YYYY-MM-DD, else might be DD-MM-YYYY
    if (y <= 31 && d && d > 31) {
      // swap: DD-MM-YYYY -> YYYY-MM-DD
      year = d;
      day = y;
      month = m;
    }
    const scheduleDate = new Date(year, (month || 1) - 1, day || 1);

    if (scheduleDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      return true;
    }
    if (scheduleDate > new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      return false;
    }
    // Same day: compare by arrivalTime first, else departureTime
    const arrivalMin = parseTimeToMinutes(schedule.arrivalTime);
    const departureMin = parseTimeToMinutes(schedule.departureTime);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (arrivalMin != null) return nowMin >= arrivalMin;
    if (departureMin != null) return nowMin >= departureMin; // fallback
    return true; // if times missing, assume completed to not block reviews unfairly
  } catch (e) {
    return true; // be permissive on parse error
  }
}

function isTripCompleted(trip) {
  if (!trip) return false;
  if (String(trip.status).toLowerCase() === "completed") return true;

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // tripDate could be a Date object (from MongoDB) or a string
    let tripDate;
    if (trip.tripDate instanceof Date) {
      tripDate = trip.tripDate;
    } else {
      tripDate = new Date(trip.tripDate);
    }
    if (isNaN(tripDate.getTime())) return false;

    const tripDayStart = new Date(tripDate.getFullYear(), tripDate.getMonth(), tripDate.getDate());

    if (tripDayStart < todayStart) {
      return true;  // Trip date is in the past
    }
    if (tripDayStart > todayStart) {
      return false; // Trip date is in the future
    }

    // Same day: compare by arrival/departure time
    const arrivalMin = parseTimeToMinutes(trip.arrivalTime);
    const departureMin = parseTimeToMinutes(trip.departureTime);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (arrivalMin != null) return nowMin >= arrivalMin;
    if (departureMin != null) return nowMin >= departureMin;
    return false;
  } catch (e) {
    console.error("isTripCompleted error:", e);
    return false;
  }
}

const createReview = async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ status: false, message: "your body is empty please add" });
    }
    const userId = req.userInfo?.id;
    const { bookingId, fleetId, rating, title, comment, images, isAnonymous } = req.body;

    console.log("═══ [CREATE REVIEW] ═══");
    console.log("[CREATE REVIEW] userId:", userId);
    console.log("[CREATE REVIEW] bookingId:", bookingId);
    console.log("[CREATE REVIEW] fleetId:", fleetId);
    console.log("[CREATE REVIEW] rating:", rating);

    if (!userId) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }
    if (!bookingId || !fleetId || !rating) {
      return res.status(400).json({
        status: false,
        message: "bookingId, fleetId and rating are required",
      });
    }

    // Verify booking ownership and status
    const booking = await Booking.findById(bookingId);
    if (!booking || String(booking.userId) !== String(userId)) {
      console.log("[CREATE REVIEW] ❌ Booking not found or userId mismatch. Booking exists:", !!booking, "UserId:", userId);
      return res
        .status(404)
        .json({ status: false, message: "Booking not found" });
    }
    if (booking.status === "cancelled") {
      console.log("[CREATE REVIEW] ❌ Booking is cancelled:", booking.status);
      return res.status(400).json({
        status: false,
        message: "Cannot review a cancelled booking",
      });
    }

    const trip = await Trip.findById(booking.tripId);
    if (!trip) {
      console.log("[CREATE REVIEW] ❌ Trip not found:", booking.tripId);
      return res.status(404).json({ status: false, message: "Trip not found" });
    }

    // Ensure booking-trip belongs to fleetId from frontend
    if (String(trip.busId) !== String(fleetId)) {
      console.log("[CREATE REVIEW] ❌ Fleet mismatch. trip.busId:", trip.busId, "fleetId:", fleetId);
      return res.status(400).json({
        status: false,
        message: "This booking does not match the provided fleet",
      });
    }

    if (!isTripCompleted(trip)) {
      console.log("[CREATE REVIEW] ❌ Trip not completed yet. TripDate:", trip.tripDate, "TripStatus:", trip.status);
      return res.status(400).json({
        status: false,
        message: "You can only review after the trip is completed",
      });
    }

    console.log("[CREATE REVIEW] ✅ All checks passed, preparing payload...");
    // Prepare review payload
    const payload = {
      userId,
      bookingId: booking._id,
      fleetId,
      tripId: booking.tripId,
      rating,
      title: title || null,
      comment: comment || null,
      images: Array.isArray(images) ? images : [],
      isAnonymous: !!isAnonymous,
    };

    // Enforce one review per booking per user via unique index; handle dup error
    try {
      const review = await Review.create(payload);

      // === PRODUCTION PATTERN: Write-time rating aggregation ===
      // Recalculate and persist aggregate onto Fleet document
      try {
        const stats = await Review.aggregate([
          { $match: { fleetId: new mongoose.Types.ObjectId(fleetId) } },
          {
            $group: {
              _id: "$fleetId",
              averageRating: { $avg: "$rating" },
              totalReviews: { $sum: 1 },
            },
          },
        ]);
        if (stats.length > 0) {
          await Bus.findByIdAndUpdate(fleetId, {
            averageRating: Math.round(stats[0].averageRating * 10) / 10,
            totalReviews: stats[0].totalReviews,
          });
        }
      } catch (aggErr) {
        // Non-blocking: log but don't fail the review creation
        console.error("Rating aggregation failed (non-blocking):", aggErr.message);
      }

      return res.status(201).json({
        status: true,
        message: "Review submitted",
      });
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({
          status: false,
          message: "You have already reviewed this booking for this fleet",
        });
      }
      throw err;
    }
  } catch (e) {
    console.error("createReview error", e);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

// GET /api/reviews/fleet/:fleetId
const getReviewsForFleet = async (req, res) => {
  try {
    const { fleetId } = req.params;
    const docs = await Review.find({ fleetId })
      .select({ rating: 1, comment: 1, createdAt: 1, userId: 1, isAnonymous: 1 })
      .populate({ path: "userId", select: "name profilePicture" })
      .sort({ createdAt: -1 })
      .lean();

    const reviews = docs.map((r) => ({
      rating: r.rating,
      comment: r.comment,
      createdAt: new Date(r.createdAt).toISOString().slice(0, 10),
      user:
        r.isAnonymous || !r.userId
          ? null
          : { name: r.userId.name, profilePicture: r.userId.profilePicture },
    }));

    // Build rating distribution (1-5 star counts) + aggregate stats
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalRating = 0;
    for (const r of docs) {
      const star = Math.max(1, Math.min(5, r.rating));
      distribution[star] = (distribution[star] || 0) + 1;
      totalRating += r.rating;
    }
    const totalReviews = docs.length;
    const averageRating = totalReviews > 0 ? Math.round((totalRating / totalReviews) * 10) / 10 : 0;

    return res.status(200).json({
      status: true,
      data: reviews,
      stats: {
        averageRating,
        totalReviews,
        distribution,
      },
    });
  } catch (e) {
    console.error("getReviewsForFleet error", e);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

// Backward compatibility (old endpoints)
// GET /api/reviews/schedule/:scheduleId
const getReviewsForSchedule = async (req, res) => {
  return res.status(410).json({
    status: false,
    message: "Schedule reviews are deprecated. Use fleet reviews instead.",
  });
};

// POST /api/reviews/bus
const getReviewsForBusNo = async (req, res) => {
  return res.status(410).json({
    status: false,
    message: "Bus number reviews are deprecated. Use fleet reviews instead.",
  });
};

// GET /api/reviews/mine
const getMyReviews = async (req, res) => {
  try {
    const userId = req.userInfo?.id;
    if (!userId) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }
    const reviews = await Review.find({ userId }).sort({ createdAt: -1 });
    return res.status(200).json({ status: true, data: reviews });
  } catch (e) {
    console.error("getMyReviews error", e);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

module.exports = {
  createReview,
  getReviewsForSchedule,
  getReviewsForBusNo,
  getReviewsForFleet,
  getMyReviews,
};
