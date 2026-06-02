/**
 * scheduleController.js
 *
 * Admin-facing API handlers for the Schedule entity.
 * Schedules are the authoritative source for recurring bus services.
 *
 * Routes (to be registered in adminRoutes.js):
 *   POST   /admin/schedules                        - Create schedule (starts as DRAFT)
 *   GET    /admin/schedules                        - All schedules (paginated)
 *   GET    /admin/schedules/:id                    - Schedule detail
 *   PATCH  /admin/schedules/:id                    - Update DRAFT/SUSPENDED schedule
 *   PATCH  /admin/schedules/:id/activate           - DRAFT/SUSPENDED → ACTIVE
 *   PATCH  /admin/schedules/:id/suspend            - ACTIVE → SUSPENDED
 *   GET    /admin/schedules/:id/trips              - All trips from this schedule
 *   GET    /admin/brands/:brandId/schedules        - All schedules for a brand
 *   POST   /admin/schedules/generate               - Manually trigger trip generation for a date
 */

const svc = require("../../services/scheduleService.js");
const { generateTripsForDate, generateTripsForDateRange } = require("../../services/tripGeneratorCron.js");
const logger = require("../../utils/logger.js");

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/schedules
// Create a new schedule (always starts as DRAFT)
// ─────────────────────────────────────────────────────────────────────────────
const createSchedule = async (req, res) => {
    try {
        const schedule = await svc.createSchedule(req.body, "ADMIN");
        return res.status(201).json({
            success: true,
            message:
                `Schedule created in DRAFT status. ` +
                `Review it and click Activate to begin generating daily trips.`,
            data: schedule,
        });
    } catch (err) {
        const status = err.message.includes("not found") ? 404 :
                       err.message.includes("SUSPENDED") ? 400 :
                       err.message.includes("not APPROVED") ? 400 : 400;
        return res.status(status).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/schedules
// All schedules platform-wide (paginated + filterable)
// ─────────────────────────────────────────────────────────────────────────────
const getAllSchedules = async (req, res) => {
    try {
        const { page, limit, status, brandId, busId } = req.query;
        const data = await svc.getAllSchedules({
            page:    parseInt(page)  || 1,
            limit:   parseInt(limit) || 30,
            status, brandId, busId,
        });
        return res.status(200).json({ success: true, ...data });
    } catch (err) {
        logger.error("scheduleController: getAllSchedules error", { error: err.message });
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/schedules/:id
// Schedule detail with full population
// ─────────────────────────────────────────────────────────────────────────────
const getScheduleById = async (req, res) => {
    try {
        const schedule = await svc.getScheduleById(req.params.id);
        return res.status(200).json({ success: true, data: schedule });
    } catch (err) {
        const status = err.message.includes("not found") ? 404 : 500;
        return res.status(status).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /admin/schedules/:id
// Update a DRAFT or SUSPENDED schedule
// ─────────────────────────────────────────────────────────────────────────────
const updateSchedule = async (req, res) => {
    try {
        const schedule = await svc.updateSchedule(req.params.id, req.body);
        return res.status(200).json({ success: true, message: "Schedule updated.", data: schedule });
    } catch (err) {
        const status = err.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /admin/schedules/:id/activate
// DRAFT or SUSPENDED → ACTIVE
// ─────────────────────────────────────────────────────────────────────────────
const activateSchedule = async (req, res) => {
    try {
        const adminId  = req.admin?._id || req.adminInfo?.id;
        const schedule = await svc.activateSchedule(req.params.id, adminId);
        return res.status(200).json({
            success: true,
            message: "Schedule ACTIVATED. Use Go Live to trigger trip generation.",
            data: schedule,
        });
    } catch (err) {
        const status = err.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /admin/schedules/:id/go-live
// ACTIVE → Burst generate trips (two-phase: activate first, then go live)
// This is the deliberate "fire" button that actually creates trip instances.
// ─────────────────────────────────────────────────────────────────────────────
const goLiveSchedule = async (req, res) => {
    try {
        const adminId  = req.admin?._id || req.adminInfo?.id;
        const schedule = await svc.goLiveSchedule(req.params.id, adminId);
        return res.status(200).json({
            success: true,
            message: "Fleet is now LIVE! Trips are being generated — passengers can start booking.",
            data: schedule,
        });
    } catch (err) {
        const status = err.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /admin/schedules/:id/suspend
// ACTIVE → SUSPENDED (no new trips generated; past trips unaffected)
// ─────────────────────────────────────────────────────────────────────────────
const suspendSchedule = async (req, res) => {
    try {
        const adminId = req.admin?._id || req.adminInfo?.id;
        const { reason, suspendUntil } = req.body;
        if (!reason) {
            return res.status(400).json({ success: false, message: "Suspension reason is required." });
        }
        const schedule = await svc.suspendSchedule(req.params.id, adminId, reason, suspendUntil);
        const msg = suspendUntil
            ? `Schedule SUSPENDED until ${new Date(suspendUntil).toLocaleDateString()}. It will auto-resume on that date.`
            : "Schedule SUSPENDED. No further trips will be generated until manually resumed.";
        return res.status(200).json({ success: true, message: msg, data: schedule });
    } catch (err) {
        const status = err.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: err.message });
    }
};

// ───────────────────────────────────────────────────────────────────────────────
// PATCH /admin/schedules/:id/resume
// SUSPENDED → ACTIVE + burst-generate trips from today forward.
// The primary action for the Workstation's "Resume Operations" button.
// The Setup Wizard is NOT used for this — wizard is first-time-only.
// ───────────────────────────────────────────────────────────────────────────────
const resumeSchedule = async (req, res) => {
    try {
        const adminId = req.admin?._id || req.adminInfo?.id;
        const schedule = await svc.resumeSchedule(req.params.id, adminId);
        return res.status(200).json({
            success: true,
            message: "Schedule RESUMED. Trips are being regenerated — passengers can book again.",
            data: schedule,
        });
    } catch (err) {
        const status = err.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/schedules/:id/trips
// All Trip instances generated from this schedule
// ─────────────────────────────────────────────────────────────────────────────
const getTripsBySchedule = async (req, res) => {
    try {
        const { status, from, to } = req.query;
        const trips = await svc.getTripsBySchedule(req.params.id, { status, from, to });
        return res.status(200).json({
            success: true,
            results: trips.length,
            data: trips,
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/brands/:brandId/schedules
// All schedules for a specific Operator Brand
// ─────────────────────────────────────────────────────────────────────────────
const getSchedulesByBrand = async (req, res) => {
    try {
        const { status } = req.query;
        const schedules = await svc.getSchedulesByBrand(req.params.brandId, { status });
        return res.status(200).json({
            success: true,
            results: schedules.length,
            data: schedules,
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/schedules/generate
// Manually trigger trip generation for a specific date
// Useful for: backfill, testing, recovering from CRON failures
// Body: { date: "YYYY-MM-DD" }
// ─────────────────────────────────────────────────────────────────────────────
const manualGenerateTrips = async (req, res) => {
    try {
        const { date } = req.body;
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                message: "date is required in YYYY-MM-DD format.",
            });
        }

        const result = await generateTripsForDate(date);
        logger.info("scheduleController: manual trip generation", result);

        return res.status(200).json({
            success: true,
            message: `Trip generation complete for ${date}.`,
            data: result,
        });
    } catch (err) {
        logger.error("scheduleController: manualGenerateTrips error", { error: err.message });
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/schedules/:id/burst
// Force-regenerate the full advance booking window for a specific schedule.
// Use this to recover from a failed burst on activation, or to backfill trips
// after a schedule was edited while SUSPENDED.
// Body: { days?: number }  (defaults to schedule.advanceGenerationDays or 60)
// ─────────────────────────────────────────────────────────────────────────────
const burstGenerateTrips = async (req, res) => {
    try {
        const { id } = req.params;
        const { days } = req.body;

        const schedule = await require("../../models/scheduleModel.js").findById(id).lean();
        if (!schedule) return res.status(404).json({ success: false, message: "Schedule not found." });
        if (schedule.status !== "ACTIVE") {
            return res.status(400).json({ success: false, message: `Schedule is ${schedule.status}. Only ACTIVE schedules can generate trips.` });
        }

        const windowDays = days || schedule.advanceGenerationDays || 60;
        const result = await generateTripsForDateRange(id, new Date(), windowDays);
        logger.info("scheduleController: burst trip generation", { scheduleId: id, ...result });

        return res.status(200).json({
            success: true,
            message: `Burst generation complete. ${result.generated} trips created, ${result.skipped} skipped.`,
            data: result,
        });
    } catch (err) {
        logger.error("scheduleController: burstGenerateTrips error", { error: err.message });
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/schedules/:id/version
// Temporal versioning: plan a future timing change without breaking live bookings.
// Seals current schedule on (effectiveFrom - 1 day), creates next version.
// Body: { departureTime, arrivalTime, effectiveFrom, fareOverride?, notes? }
// ─────────────────────────────────────────────────────────────────────────────
const createScheduleVersion = async (req, res) => {
    try {
        const adminId = req.admin?._id || req.adminInfo?.id;
        const { departureTime, arrivalTime, effectiveFrom, fareOverride, notes } = req.body;
        const { current, newVersion } = await svc.createScheduleVersion(
            req.params.id,
            { departureTime, arrivalTime, effectiveFrom, fareOverride, notes },
            adminId
        );
        const fromDate = new Date(effectiveFrom).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const sealDate = new Date(current.effectiveUntil).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        return res.status(201).json({
            success: true,
            message: `Version ${newVersion.versionNumber} planned. New timings go live ${fromDate}. Current service sealed until ${sealDate}.`,
            data: { currentSchedule: current, newVersion },
        });
    } catch (err) {
        const status = err.message.includes("not found") ? 404
                     : err.message.includes("already has") ? 409 : 400;
        return res.status(status).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /admin/schedules/:id/deactivate
// Permanently stop a schedule (any status → INACTIVE).
// INACTIVE is a permanent soft-delete — preserved for audit history.
// Cannot have upcoming trips; operator must create a new schedule to resume.
// ─────────────────────────────────────────────────────────────────────────────
const deactivateSchedule = async (req, res) => {
    try {
        const adminId = req.admin?._id || req.adminInfo?.id;
        const { reason } = req.body;
        const schedule = await svc.deactivateSchedule(req.params.id, adminId, reason);
        return res.status(200).json({
            success: true,
            message: "Schedule is now INACTIVE. Create a new schedule to resume this service.",
            data: schedule,
        });
    } catch (err) {
        const status = err.message.includes("not found") ? 404 :
                       err.message.includes("upcoming trip") ? 409 : 400;
        return res.status(status).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /admin/schedules/:id
// Hard delete — only DRAFT schedules. DRAFT schedules have never generated trips.
// Any schedule that was ever ACTIVE must be deactivated (INACTIVE), not deleted.
// ─────────────────────────────────────────────────────────────────────────────
const deleteSchedule = async (req, res) => {
    try {
        await svc.deleteSchedule(req.params.id);
        return res.status(200).json({
            success: true,
            message: "DRAFT schedule deleted.",
        });
    } catch (err) {
        const status = err.message.includes("not found") ? 404 :
                       err.message.includes("Only DRAFT") ? 403 : 400;
        return res.status(status).json({ success: false, message: err.message });
    }
};

module.exports = {
    createSchedule,
    getAllSchedules,
    getScheduleById,
    updateSchedule,
    activateSchedule,
    goLiveSchedule,
    suspendSchedule,
    resumeSchedule,
    createScheduleVersion,
    deactivateSchedule,
    deleteSchedule,
    getTripsBySchedule,
    getSchedulesByBrand,
    manualGenerateTrips,
    burstGenerateTrips,
};
