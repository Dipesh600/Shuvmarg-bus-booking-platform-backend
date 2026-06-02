/**
 * tripExceptionController.js
 * Handles all trip-level exceptions (cancel, reschedule, date-range cancel, extra run).
 */

const svc    = require("../../services/tripExceptionService");
const logger = require("../../utils/logger");

// ─── PATCH /trips/:id/cancel ──────────────────────────────────────────────────
const cancelTrip = async (req, res) => {
    try {
        const adminId = req.admin?._id || req.adminInfo?.id;
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ success: false, message: "Cancellation reason is required." });

        const result = await svc.cancelTrip(req.params.id, reason, adminId);

        return res.status(200).json({
            success: true,
            message: `Trip cancelled. ${result.bookingsReleased} booking(s) released.`,
            data: {
                trip: result.trip,
                bookingsReleased: result.bookingsReleased,
            },
        });
    } catch (err) {
        logger.error("tripExceptionController: cancelTrip", { error: err.message });
        const status = err.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: err.message });
    }
};

// ─── PATCH /trips/:id/reschedule ──────────────────────────────────────────────
const rescheduleTrip = async (req, res) => {
    try {
        const adminId = req.admin?._id || req.adminInfo?.id;
        const { newDepartureTime, newArrivalTime, reason } = req.body;

        const result = await svc.rescheduleTrip(req.params.id, { newDepartureTime, newArrivalTime, reason }, adminId);

        return res.status(200).json({
            success: true,
            message: `Trip rescheduled to ${newDepartureTime} → ${newArrivalTime}. Existing bookings are unaffected.`,
            data: result.trip,
        });
    } catch (err) {
        logger.error("tripExceptionController: rescheduleTrip", { error: err.message });
        const status = err.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: err.message });
    }
};

// ─── POST /schedules/:id/cancel-range ────────────────────────────────────────
// Body: { fromDate, toDate, reason }
// Cancels all trips for this schedule between fromDate and toDate (inclusive).
// Master schedule is NOT suspended — resumes normally after the window.
const cancelDateRange = async (req, res) => {
    try {
        const adminId = req.admin?._id || req.adminInfo?.id;
        const { fromDate, toDate, reason } = req.body;

        const result = await svc.cancelDateRange(req.params.id, fromDate, toDate, reason, adminId);

        const fromStr = new Date(result.fromDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const toStr   = new Date(result.toDate).toLocaleDateString("en-US",   { month: "short", day: "numeric" });

        return res.status(200).json({
            success: true,
            message: result.tripsAffected === 0
                ? result.message
                : `${result.tripsAffected} trip(s) cancelled from ${fromStr} to ${toStr}. ${result.bookingsReleased} booking(s) released.`,
            data: result,
        });
    } catch (err) {
        logger.error("tripExceptionController: cancelDateRange", { error: err.message });
        const status = err.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: err.message });
    }
};

// ─── POST /schedules/:id/extra-run ───────────────────────────────────────────
// Body: { tripDate, departureTime?, arrivalTime?, notes? }
// Creates a one-off trip on a specific date outside the regular schedule.
const createExtraRun = async (req, res) => {
    try {
        const adminId = req.admin?._id || req.adminInfo?.id;
        const { tripDate, departureTime, arrivalTime, notes } = req.body;

        const result = await svc.createExtraRun(req.params.id, { tripDate, departureTime, arrivalTime, notes }, adminId);

        return res.status(201).json({
            success: true,
            message: `Extra run added for ${new Date(tripDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at ${result.trip.departureTime}.`,
            data: result.trip,
        });
    } catch (err) {
        logger.error("tripExceptionController: createExtraRun", { error: err.message });
        const status = err.message.includes("not found") ? 404
                     : err.message.includes("already exists") ? 409 : 400;
        return res.status(status).json({ success: false, message: err.message });
    }
};

module.exports = {
    cancelTrip,
    rescheduleTrip,
    cancelDateRange,
    createExtraRun,
};
