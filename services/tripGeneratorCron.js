/**
 * tripGeneratorCron.js
 *
 * Daily CRON job: generates Trip instances from active Schedule records.
 *
 * Runs: daily at 00:01 server time (just after midnight)
 *
 * Algorithm:
 *  1. Find all ACTIVE schedules whose effective period includes tomorrow
 *  2. For WEEKLY/CUSTOM: check if tomorrow's day-of-week matches daysOfWeek
 *  3. Idempotency check: skip if a trip for this schedule + date already exists
 *  4. Create a Trip with full chain: scheduleId, brandId, busId, ownerId
 *  5. Initialize the seat map from the schedule's seatTemplateId
 *
 * This replaces the old "template trip" pattern where a Trip record was
 * overloaded to serve as both a template and an actual trip instance.
 */

const cron         = require("node-cron");
const Schedule     = require("../models/scheduleModel.js");
const Trip         = require("../models/tripModel.js");
const Seat         = require("../models/seatsModel.js");
const SeatTemplate = require("../models/seatTemplateModel.js");
const Bus          = require("../models/fleetModel.js");
const logger       = require("../utils/logger.js");

// ─── HELPER: Initialize seat document for a newly generated trip ──────────────

/**
 * Build the seata/seatb/seatc arrays from a schedule's bus configuration.
 *
 * Priority order (V2 architecture):
 *  1. Bus's embedded seatConfig.floors (V2 visual builder output)
 *  2. Legacy SeatTemplate referenced by seatTemplateId
 *
 * The V2 seatConfig stores a 2D grid of cells. We map SEAT cells into the
 * legacy seata/seatb/seatc columns using colIndex as the partition heuristic:
 *   colIndex 0–1  → seata  (left window/aisle)
 *   colIndex 2    → seatc  (middle, e.g., 2+1 layout centre)
 *   colIndex 3+   → seatb  (right window/aisle)
 */
const buildSeatArrays = async (busId, templateId) => {
    // Attempt V2 path first: bus's own embedded seatConfig
    const bus = await Bus.findById(busId).select("seatConfig").lean();
    if (bus?.seatConfig?.floors?.length > 0) {
        const seata = [], seatb = [], seatc = [];
        for (const floor of bus.seatConfig.floors) {
            for (const row of (floor.rows || [])) {
                for (const cell of (row.cells || [])) {
                    if (cell.cellType !== "SEAT" || !cell.seatLabel) continue;
                    const col = cell.colIndex ?? 0;
                    const entry = { seatNo: cell.seatLabel, booked: false };
                    if (col <= 1)      seata.push(entry);
                    else if (col >= 3) seatb.push(entry);
                    else               seatc.push(entry);
                }
            }
        }
        if (seata.length > 0 || seatb.length > 0 || seatc.length > 0) {
            return { seata, seatb, seatc };
        }
    }

    // Fallback: legacy SeatTemplate
    if (templateId) {
        const template = await SeatTemplate.findById(templateId).lean();
        if (template) {
            return {
                seata: (template.seata || []).map(s => ({ seatNo: s.seatNo, booked: false })),
                seatb: (template.seatb || []).map(s => ({ seatNo: s.seatNo, booked: false })),
                seatc: (template.seatc || []).map(s => ({ seatNo: s.seatNo, booked: false })),
            };
        }
    }

    logger.warn("TripCRON: no seat layout found — creating trip with empty seat map", { busId, templateId });
    return { seata: [], seatb: [], seatc: [] };
};

const initializeSeats = async (tripId, busId, templateId) => {
    try {
        const { seata, seatb, seatc } = await buildSeatArrays(busId, templateId);
        await Seat.create({ tripId, seata, seatb, seatc });
    } catch (e) {
        logger.error("TripCRON: failed to initialise seats", { tripId, error: e.message });
    }
};

// ─── HELPER: Get date range for a specific day offset ────────────────────────
// offset=1 → tomorrow, offset=60 → 60 days from now (rolling window end)

const getDateRangeForOffset = (offsetDays) => {
    const now = new Date();

    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() + offsetDays);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setUTCHours(23, 59, 59, 999);

    return { start, end, dayOfWeek: start.getUTCDay() }; // 0=Sun, 6=Sat
};

// ─── HELPER: Should this schedule generate a trip tomorrow? ──────────────────

const shouldGenerate = (schedule, dayOfWeek) => {
    if (schedule.recurrence === "DAILY") return true;
    if (schedule.recurrence === "WEEKLY" || schedule.recurrence === "CUSTOM") {
        return Array.isArray(schedule.daysOfWeek) &&
               schedule.daysOfWeek.includes(dayOfWeek);
    }
    return false;
};

// ─── HELPER: Deterministic Alternating Guard (RELAY) ─────────────────────────
// Instead of relying on a database race condition to alternate directions,
// we use mathematical parity. For RELAY schedules, the bus only operates on
// even-numbered days relative to its own effectiveFrom date.
const isAlternatingDay = (schedule, targetDate) => {
    if (schedule.operationalModel !== "RELAY") return true;

    const effectiveDate = new Date(schedule.effectiveFrom);
    effectiveDate.setUTCHours(0, 0, 0, 0);

    const target = new Date(targetDate);
    target.setUTCHours(0, 0, 0, 0);

    const diffTime = Math.abs(target - effectiveDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return diffDays % 2 === 0;
};

// ─── MAIN CRON FUNCTION ───────────────────────────────────────────────────────

const setupTripGeneratorCron = () => {
    // Run at 00:01 every day — just after midnight
    cron.schedule("1 0 * * *", async () => {
        logger.info("TripCRON: ═══ starting daily rolling-window trip generation ═══");

        try {
            const now = new Date();

            // ── Auto-resume sweep ──────────────────────────────────────────────
            // Find SUSPENDED schedules whose suspendUntil date has passed.
            // Flip them back to ACTIVE so they re-enter the generation loop below.
            const toAutoResume = await Schedule.find({
                status: "SUSPENDED",
                suspendUntil: { $lte: now },
            });
            if (toAutoResume.length > 0) {
                for (const s of toAutoResume) {
                    s.status      = "ACTIVE";
                    s.suspendUntil = null;
                    await s.save();
                    logger.info("TripCRON: auto-resumed schedule (suspendUntil passed)", {
                        scheduleId: s._id,
                        direction:  s.operationalModel,
                    });
                }
            }

            // Fetch all ACTIVE schedules
            const schedules = await Schedule.find({
                status: "ACTIVE",
                effectiveFrom: { $lte: new Date(now.getTime() + 180 * 86400000) }, // started within max window
                $or: [
                    { effectiveUntil: null },
                    { effectiveUntil: { $gte: now } },
                ],
            }).lean();

            logger.info(`TripCRON: found ${schedules.length} active schedules`);

            let generated = 0;
            let skipped   = 0;
            let errors    = 0;

            for (const schedule of schedules) {
                try {
                    // Each schedule maintains its own rolling window.
                    // Today's CRON run generates the trip that is exactly
                    // advanceGenerationDays ahead for this schedule.
                    const windowDays = schedule.advanceGenerationDays || 60;
                    const { start, end, dayOfWeek } = getDateRangeForOffset(windowDays);
                    const dateStr = start.toISOString().split("T")[0];

                    // ── Effective period check ──────────────────────────────
                    if (start < new Date(schedule.effectiveFrom)) { skipped++; continue; }
                    if (schedule.effectiveUntil && start > new Date(schedule.effectiveUntil)) {
                        skipped++;
                        continue;
                    }

                    // ── Recurrence filter ───────────────────────────────────
                    if (!shouldGenerate(schedule, dayOfWeek)) { skipped++; continue; }

                    // ── First-departure-direction gate (RETURN schedules) ───
                    // On the very first day (effectiveFrom), a RETURN schedule
                    // cannot run if the bus hasn't arrived from the FORWARD trip yet.
                    // Skip Day-1 for RETURN schedules linked to a FORWARD schedule.
                    if (
                        schedule.returnScheduleId &&
                        start.toISOString().split("T")[0] ===
                        new Date(schedule.effectiveFrom).toISOString().split("T")[0]
                    ) {
                        // Find the forward schedule to check arrival + layover
                        const forwardSched = await Schedule.findOne({
                            returnScheduleId: schedule._id,
                        }).select("arrivalTime layoverMinutes").lean();

                        if (forwardSched) {
                            const [arrH, arrM] = forwardSched.arrivalTime.split(":").map(Number);
                            const layover      = forwardSched.layoverMinutes || 60;
                            const [depH, depM] = schedule.departureTime.split(":").map(Number);

                            const arrivalTotalMin  = arrH * 60 + arrM + layover;
                            const departureTotalMin = depH * 60 + depM;

                            if (departureTotalMin < arrivalTotalMin) {
                                logger.info("TripCRON: skipping Day-1 return trip (bus not yet arrived)", {
                                    scheduleId: schedule._id,
                                    date: dateStr,
                                });
                                skipped++;
                                continue;
                            }
                        }
                    }

                    // ── Idempotency check (schedule-level) ──────────────────
                    const exists = await Trip.findOne({
                        scheduleId: schedule._id,
                        tripDate:   { $gte: start, $lte: end },
                    }).lean();

                    if (exists) { skipped++; continue; }

                    // ── Deterministic Alternating Guard (RELAY) ───────────────────
                    if (!isAlternatingDay(schedule, start)) {
                        skipped++;
                        continue;
                    }

                    // ── Generate the Trip ───────────────────────────────────
                    await createTripFromSchedule(schedule, start, dateStr);
                    generated++;

                } catch (innerErr) {
                    logger.error("TripCRON: ✗ error processing schedule", {
                        scheduleId: schedule._id,
                        error: innerErr.message,
                    });
                    errors++;
                }
            }

            logger.info("TripCRON: ═══ completed ═══", { generated, skipped, errors });

        } catch (fatalErr) {
            logger.error("TripCRON: FATAL error in generation job", { error: fatalErr.message });
        }
    });

    logger.info("TripCRON: scheduled — runs daily at 00:01 (rolling window per schedule)");
};

// ─── SHARED HELPER: Create a single Trip from a Schedule ─────────────────────
// Used by both the CRON and the burst generator (on activation).

const createTripFromSchedule = async (schedule, tripDateStart, dateStr) => {
    const newTripId = `TRIP-${dateStr}-${schedule._id.toString().slice(-6)}-${Math.floor(Math.random() * 100)}`;

    const [hours, minutes] = schedule.departureTime.split(":").map(Number);
    const departureDate = new Date(tripDateStart);
    departureDate.setUTCHours(hours, minutes, 0, 0);
    const cutoffHours = schedule.bookingCutoffHours ?? 2;
    const bookingClosesAt = new Date(departureDate.getTime() - (cutoffHours * 60 * 60 * 1000));

    // ── Compute direction label (baked at creation time) ─────────────────
    let directionLabel = null;
    let fromStopName = null;
    let toStopName = null;

    if (schedule.variantId) {
        try {
            const RouteVariant = require("../models/routeVariantModel");
            const RouteCorridor = require("../models/routeCorridorModel");
            const Stop = require("../models/stopModel");
            const variant = await RouteVariant.findById(schedule.variantId)
                .populate({
                    path: "corridorId",
                    select: "originId destinationId",
                    populate: [
                        { path: "originId", select: "name" },
                        { path: "destinationId", select: "name" },
                    ],
                })
                .select("direction corridorId")
                .lean();

            if (variant?.corridorId) {
                const originName = variant.corridorId.originId?.name || "?";
                const destName = variant.corridorId.destinationId?.name || "?";

                if (variant.direction === "RETURN") {
                    fromStopName = destName;
                    toStopName = originName;
                } else {
                    fromStopName = originName;
                    toStopName = destName;
                }
                directionLabel = `${fromStopName} → ${toStopName}`;
            }
        } catch (err) {
            logger.warn("TripCRON: failed to compute directionLabel, skipping", {
                scheduleId: schedule._id,
                error: err.message,
            });
        }
    }

    const newTrip = await Trip.create({
        tripId:          newTripId,
        scheduleId:      schedule._id,
        brandId:         schedule.brandId,
        ownerId:         schedule.ownerId,
        busId:           schedule.busId,
        variantId:       schedule.variantId  || null,
        driverId:        schedule.driverId   || null,   // inherited from schedule default
        seatTemplateId:  schedule.seatTemplateId,
        tripDate:        tripDateStart,
        departureTime:   schedule.departureTime,
        arrivalTime:     schedule.arrivalTime,
        shift:           schedule.shift,
        tripFare:        schedule.fareOverride || null,
        isAutoGenerated: true,
        status:          "scheduled",
        recurrence:      "none",
        isActive:        true,
        bookingClosesAt: bookingClosesAt,
        directionLabel:  directionLabel,
        fromStopName:    fromStopName,
        toStopName:      toStopName,
    });

    await initializeSeats(newTrip._id, schedule.busId, schedule.seatTemplateId);

    logger.info("TripCRON: ✓ generated trip", {
        tripId:    newTrip.tripId,
        scheduleId: schedule._id,
        date:      dateStr,
        departure: schedule.departureTime,
        direction: directionLabel,
    });

    return newTrip;
};

// ─── BURST GENERATOR: Generate trips for a date range for ONE schedule ────────
// Called when a schedule is ACTIVATED to immediately populate the booking window.
// Also useful for admin backfill and re-generation after suspension.

const generateTripsForDateRange = async (scheduleId, fromDate, daysAhead) => {
    const schedule = await Schedule.findById(scheduleId).lean();
    if (!schedule) throw new Error("Schedule not found for burst generation.");

    const from  = new Date(fromDate);
    from.setUTCHours(0, 0, 0, 0);

    let generated = 0;
    let skipped   = 0;
    let errors    = 0;

    for (let i = 0; i <= daysAhead; i++) {
        try {
            const day = new Date(from);
            day.setUTCDate(from.getUTCDate() + i);
            const dayEnd = new Date(day);
            dayEnd.setUTCHours(23, 59, 59, 999);
            const dayOfWeek = day.getUTCDay();
            const dateStr   = day.toISOString().split("T")[0];

            // Effective period check
            if (day < new Date(schedule.effectiveFrom)) { skipped++; continue; }
            if (schedule.effectiveUntil && day > new Date(schedule.effectiveUntil)) { skipped++; continue; }

            // Recurrence check
            if (!shouldGenerate(schedule, dayOfWeek)) { skipped++; continue; }

            // Idempotency (schedule-level: was this specific schedule already run for this date?)
            const exists = await Trip.findOne({
                scheduleId: schedule._id,
                tripDate: { $gte: day, $lte: dayEnd },
            }).lean();
            if (exists) { skipped++; continue; }

            // Deterministic alternating logic for RELAY schedules
            if (!isAlternatingDay(schedule, day)) {
                skipped++;
                continue;
            }

            await createTripFromSchedule(schedule, day, dateStr);
            generated++;
        } catch (e) {
            logger.error(`TripCRON [BURST]: error for day ${i}`, { scheduleId, error: e.message });
            errors++;
        }
    }

    logger.info("TripCRON [BURST]: completed", { scheduleId, daysAhead, generated, skipped, errors });
    return { generated, skipped, errors };
};

// ─── MANUAL TRIGGER (for testing / backfill) ─────────────────────────────────

/**
 * Generate trips for a specific date from all active schedules.
 * Used by the admin "Generate Trips" button or for backfill purposes.
 */
const generateTripsForDate = async (targetDate) => {
    const start = new Date(targetDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCHours(23, 59, 59, 999);
    const dayOfWeek = start.getUTCDay();
    const dateStr   = start.toISOString().split("T")[0];

    logger.info(`TripCRON [MANUAL]: generating trips for ${dateStr}`);

    const schedules = await Schedule.find({
        status: "ACTIVE",
        effectiveFrom: { $lte: end },
        $or: [
            { effectiveUntil: null },
            { effectiveUntil: { $gte: start } },
        ],
    }).lean();

    let generated = 0;
    let skipped   = 0;
    let errors    = 0;

    for (const schedule of schedules) {
        try {
            if (!shouldGenerate(schedule, dayOfWeek)) { skipped++; continue; }

            const exists = await Trip.findOne({
                scheduleId: schedule._id,
                tripDate: { $gte: start, $lte: end },
            }).lean();

            if (exists) { skipped++; continue; }

            // Deterministic alternating logic for RELAY schedules
            if (!isAlternatingDay(schedule, start)) {
                skipped++;
                continue;
            }

            const newTripId = `TRIP-${dateStr}-${schedule._id.toString().slice(-6)}-${Math.floor(Math.random() * 100)}`;

            const [hours, minutes] = schedule.departureTime.split(":").map(Number);
            const departureDate = new Date(start);
            departureDate.setUTCHours(hours, minutes, 0, 0);
            const cutoffHours = schedule.bookingCutoffHours ?? 2;
            const bookingClosesAt = new Date(departureDate.getTime() - (cutoffHours * 60 * 60 * 1000));

            const newTrip = await Trip.create({
                tripId:          newTripId,
                scheduleId:      schedule._id,
                brandId:         schedule.brandId,
                ownerId:         schedule.ownerId,
                busId:           schedule.busId,
                variantId:       schedule.variantId || null,
                driverId:        schedule.driverId  || null,
                seatTemplateId:  schedule.seatTemplateId,
                tripDate:        start,
                departureTime:   schedule.departureTime,
                arrivalTime:     schedule.arrivalTime,
                shift:           schedule.shift,
                tripFare:        schedule.fareOverride || null,
                isAutoGenerated: true,
                status:          "scheduled",
                recurrence:      "none",
                isActive:        true,
                bookingClosesAt: bookingClosesAt,
            });

            await initializeSeats(newTrip._id, schedule.busId, schedule.seatTemplateId);
            generated++;

        } catch (e) {
            logger.error(`TripCRON [MANUAL]: error for schedule ${schedule._id}`, { error: e.message });
            errors++;
        }
    }

    return { date: dateStr, generated, skipped, errors };
};

module.exports = { setupTripGeneratorCron, generateTripsForDate, generateTripsForDateRange };
