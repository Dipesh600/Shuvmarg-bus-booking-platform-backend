/**
 * scheduleService.js
 *
 * Business logic for the Schedule entity.
 * A Schedule is the SOURCE OF TRUTH for a repeating bus service.
 * Trips are generated FROM schedules — never created manually for recurring services.
 *
 * Chain: Brand → Fleet (bus) → Schedule → Trip (daily instance)
 */

const Schedule          = require("../models/scheduleModel.js");
const Fleet             = require("../models/fleetModel.js");
const OperatorBrand     = require("../models/operatorBrandModel.js");
const SeatTemplate      = require("../models/seatTemplateModel.js");
const Trip              = require("../models/tripModel.js");
const OperatorRouteConfig = require("../models/operatorRouteConfigModel.js");
const RouteVariant        = require("../models/routeVariantModel.js");
const { generateTripsForDateRange } = require("./tripGeneratorCron.js");
const logger            = require("../utils/logger.js");

// ─── VALIDATION HELPERS ───────────────────────────────────────────────────────

/**
 * Validate HH:MM format (24-hour)
 */
const isValidTime = (t) => /^\d{2}:\d{2}$/.test(t);

/**
 * Validate that daysOfWeek is correct for a given recurrence type
 */
const validateRecurrence = (recurrence, daysOfWeek) => {
    if (recurrence === "DAILY") return; // daysOfWeek not needed

    if (recurrence === "WEEKLY" || recurrence === "CUSTOM") {
        if (!daysOfWeek || daysOfWeek.length === 0) {
            throw new Error(
                `daysOfWeek is required when recurrence is "${recurrence}". ` +
                `Provide an array of 0–6 (Sun–Sat).`
            );
        }
        if (daysOfWeek.some((d) => d < 0 || d > 6)) {
            throw new Error("daysOfWeek must contain values 0–6 only.");
        }
    }
};

// ─── CREATE SCHEDULE ──────────────────────────────────────────────────────────

/**
 * Create a new Schedule.
 *
 * Gating rules enforced:
 *  1. Owner KYC must be approved (via brand ownership check)
 *  2. Brand must be ACTIVE (not SUSPENDED)
 *  3. Fleet must be APPROVED and ACTIVE
 *  4. Fleet must belong to the brand (prevents cross-brand misuse)
 *  5. Seat template must exist
 *  6. No duplicate ACTIVE schedule for the same bus + departure time
 *
 * @param {Object} data - Schedule fields from the request body
 * @param {string} createdBy - "ADMIN" or "OWNER"
 */
const createSchedule = async (data, createdBy = "ADMIN") => {
    const {
        brandId,
        busId,
        variantId,
        operatorRouteConfigId,
        driverId,
        seatTemplateId,
        departureTime,
        arrivalTime,
        shift,
        recurrence,
        daysOfWeek,
        effectiveFrom,
        effectiveUntil,
        fareOverride,
        notes,
        // ── Booking window fields ─────────────────────────────────────────────
        advanceBookingDays,        // how many days ahead passengers can book
        bookingCutoffHours,        // hours before departure booking closes
        advanceGenerationDays,     // rolling trip generation window
        // ── Return trip / operational pattern ────────────────────────────────
        operationalModel,          // TURNAROUND | RELAY
        layoverMinutes,            // rest time at destination before return
        returnScheduleId,          // ObjectId of the linked return schedule
    } = data;

    // ── Required field validation ─────────────────────────────────────────────
    if (!brandId)        throw new Error("brandId is required.");
    if (!busId)          throw new Error("busId is required.");
    if (!departureTime)  throw new Error("departureTime is required (HH:MM).");
    if (!arrivalTime)    throw new Error("arrivalTime is required (HH:MM).");
    if (!shift)          throw new Error("shift is required (day/night).");
    if (!recurrence)     throw new Error("recurrence is required (DAILY/WEEKLY/CUSTOM).");
    if (!effectiveFrom)  throw new Error("effectiveFrom is required.");

    if (!isValidTime(departureTime)) throw new Error("departureTime must be in HH:MM format.");
    if (!isValidTime(arrivalTime))   throw new Error("arrivalTime must be in HH:MM format.");

    validateRecurrence(recurrence, daysOfWeek);

    if (effectiveUntil && new Date(effectiveUntil) <= new Date(effectiveFrom)) {
        throw new Error("effectiveUntil must be after effectiveFrom.");
    }

    // ── Gate 1: Brand must exist and be ACTIVE ────────────────────────────────
    const brand = await OperatorBrand.findById(brandId)
        .select("status brandName ownerId")
        .lean();
    if (!brand) throw new Error("Brand not found.");
    if (brand.status === "SUSPENDED") {
        throw new Error(
            `Brand "${brand.brandName}" is SUSPENDED. ` +
            `Reinstate the brand before creating schedules.`
        );
    }
    if (brand.status !== "ACTIVE") {
        throw new Error(
            `Brand "${brand.brandName}" is not ACTIVE (current: ${brand.status}). ` +
            `Only ACTIVE brands can run schedules.`
        );
    }

    // ── Gate 2: Fleet must exist AND belong to this brand ────────────────────
    const fleet = await Fleet.findById(busId)
        .select("busName busNumber brandId ownerId approvalStatus status")
        .lean();
    if (!fleet) throw new Error("Fleet (bus) not found.");

    if (fleet.brandId?.toString() !== brandId.toString()) {
        throw new Error(
            `Bus "${fleet.busNumber}" does not belong to brand "${brand.brandName}". ` +
            `A schedule must use a bus assigned to the same brand.`
        );
    }

    // ── Gate 3: Fleet must be APPROVED ───────────────────────────────────────
    if (fleet.approvalStatus !== "APPROVED") {
        throw new Error(
            `Bus "${fleet.busName} (${fleet.busNumber})" is not APPROVED ` +
            `(status: ${fleet.approvalStatus}). Approve the vehicle before scheduling.`
        );
    }

    // ── Gate 4: Fleet must be ACTIVE ─────────────────────────────────────────
    if (fleet.status !== "ACTIVE") {
        throw new Error(
            `Bus "${fleet.busName} (${fleet.busNumber})" is not ACTIVE ` +
            `(status: ${fleet.status}). Set the vehicle to ACTIVE before scheduling.`
        );
    }

    // ── Gate 5: Seat template (optional — V2 uses bus-embedded seatConfig) ─────
    // Only validate the template if one was explicitly provided.
    if (seatTemplateId) {
        const template = await SeatTemplate.findById(seatTemplateId).select("_id").lean();
        if (!template) throw new Error("Seat template not found.");
    }

    // ── Gate 5.5: Resolve and validate the OperatorRouteConfig (Pattern) ─────
    // Chain enforced here:
    //   Platform Registry (Variant) → OperatorRouteConfig (Pattern) → Schedule → Trip
    //
    // Resolution order:
    //   1. If operatorRouteConfigId is explicitly provided → validate it belongs
    //      to this brand and (if variantId also provided) to that variant.
    //   2. If only variantId is provided → auto-resolve to the isDefault pattern
    //      for that variant. If no default exists but exactly one pattern exists,
    //      use it. If multiple exist with no default → throw a clear error.
    //   3. If neither is provided → no config linked (legacy/unrouted schedule).
    //
    let resolvedConfigId = operatorRouteConfigId || null;
    if (resolvedConfigId) {
        // Validate the provided configId belongs to this brand
        const routeConfig = await OperatorRouteConfig.findOne({
            _id: resolvedConfigId,
            brandId,
            status: "ACTIVE",
        }).select("_id variantId patternName").lean();

        if (!routeConfig) {
            throw new Error(
                `The provided route pattern (operatorRouteConfigId) was not found or is not ACTIVE ` +
                `for this brand. Verify the pattern exists in Route Services.`
            );
        }
        // If variantId also provided, ensure the config matches. 
        // Note: For RETURN schedules, the provided variantId is the return variant, 
        // but the config is bound to the FORWARD variant.
        if (variantId && routeConfig.variantId?.toString() !== variantId.toString()) {
            const forwardVariant = await RouteVariant.findById(routeConfig.variantId).select("returnVariantId").lean();
            if (!forwardVariant || forwardVariant.returnVariantId?.toString() !== variantId.toString()) {
                throw new Error(
                    `Route pattern mismatch: the provided operatorRouteConfigId belongs to a different ` +
                    `variant than the provided variantId.`
                );
            }
        }
    } else if (variantId) {
        // Auto-resolve: find the default pattern for this variant
        let routeConfig = await OperatorRouteConfig.findOne({
            brandId,
            variantId,
            isDefault: true,
            status: "ACTIVE",
        }).select("_id patternName").lean();

        if (!routeConfig) {
            // Fallback: if exactly one pattern exists, use it
            const allPatterns = await OperatorRouteConfig.find({
                brandId,
                variantId,
                status: "ACTIVE",
            }).select("_id patternName").lean();

            if (allPatterns.length === 0) {
                throw new Error(
                    `Brand has no ACTIVE route configuration for this variant. ` +
                    `Go to Route Services → Add Service Pattern on this route first.`
                );
            }
            if (allPatterns.length === 1) {
                routeConfig = allPatterns[0];
            } else {
                // Multiple patterns, no default — operator must be explicit
                const names = allPatterns.map(p => `"${p.patternName}"`).join(", ");
                throw new Error(
                    `Multiple route patterns exist for this variant (${names}) but none is marked as default. ` +
                    `Either set a default pattern in Route Services, or provide operatorRouteConfigId explicitly ` +
                    `to select the specific pattern for this schedule.`
                );
            }
        }
        resolvedConfigId = routeConfig._id;
    }


    // ── Gate 6: No duplicate ACTIVE schedule for bus + departure time ─────────
    const conflict = await Schedule.findOne({
        busId,
        departureTime,
        status: "ACTIVE",
    }).lean();
    if (conflict) {
        throw new Error(
            `An ACTIVE schedule already exists for this bus at ${departureTime}. ` +
            `A bus cannot have two active schedules at the same departure time.`
        );
    }

    // ── Create the schedule ───────────────────────────────────────────────────
    const schedule = await Schedule.create({
        brandId,
        ownerId:  fleet.ownerId,   // denormalize from fleet (authoritative source)
        busId,
        variantId:             variantId || null,
        operatorRouteConfigId: resolvedConfigId,   // auto-resolved from variantId
        driverId:              driverId || null,
        seatTemplateId,
        departureTime,
        arrivalTime,
        shift,
        recurrence,
        daysOfWeek:      recurrence === "DAILY" ? [] : (daysOfWeek || []),
        effectiveFrom:   new Date(effectiveFrom),
        effectiveUntil:  effectiveUntil ? new Date(effectiveUntil) : null,
        fareOverride:    fareOverride || null,
        notes:           notes || null,
        status:          "DRAFT",    // Always starts as DRAFT — admin activates
        createdBy,
        // ── Booking window (operator-configurable, fall to schema defaults) ───
        advanceBookingDays:    advanceBookingDays    ?? 60,
        bookingCutoffHours:    bookingCutoffHours    ?? 2,
        advanceGenerationDays: advanceGenerationDays ?? 60,
        // ── Return trip / operational pattern ────────────────────────────────
        operationalModel:  operationalModel  || "TURNAROUND",
        layoverMinutes:    layoverMinutes    ?? 60,
        returnScheduleId:  returnScheduleId  || null,
    });

    logger.info("scheduleService: schedule created", {
        scheduleId: schedule._id,
        brandId,
        busId,
        departureTime,
        recurrence,
    });

    return schedule;
};

// ─── ACTIVATE SCHEDULE ────────────────────────────────────────────────────────

/**
 * Activate a DRAFT or SUSPENDED schedule.
 * Only an admin can activate — this is a deliberate gate.
 *
 * On activation, the CRON will pick this up on its next run and begin
 * generating daily Trip instances.
 */
const activateSchedule = async (scheduleId, adminId) => {
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) throw new Error("Schedule not found.");

    if (schedule.status === "ACTIVE") {
        throw new Error("Schedule is already ACTIVE.");
    }
    if (schedule.status === "INACTIVE") {
        throw new Error("Cannot reactivate an INACTIVE schedule. Create a new one.");
    }

    // Re-run fleet health checks on activation
    const fleet = await Fleet.findById(schedule.busId)
        .select("approvalStatus status busName busNumber")
        .lean();
    if (!fleet) throw new Error("Fleet not found — cannot activate schedule.");
    if (fleet.approvalStatus !== "APPROVED") {
        throw new Error(`Fleet "${fleet.busNumber}" is not APPROVED. Approve the vehicle first.`);
    }
    if (fleet.status !== "ACTIVE") {
        throw new Error(`Fleet "${fleet.busNumber}" is not ACTIVE. Cannot activate schedule.`);
    }

    // Set the fleet to setupComplete since it now has an active schedule
    await Fleet.findByIdAndUpdate(schedule.busId, { setupComplete: true });

    schedule.status      = "ACTIVE";
    schedule.activatedBy = adminId;
    schedule.activatedAt = new Date();
    await schedule.save();

    // F4 FIX: Auto-activate linked return schedule if present
    let linkedSchedule = null;
    if (schedule.returnScheduleId) {
        linkedSchedule = await Schedule.findById(schedule.returnScheduleId);
        if (linkedSchedule && (linkedSchedule.status === "DRAFT" || linkedSchedule.status === "SUSPENDED")) {
            linkedSchedule.status = "ACTIVE";
            linkedSchedule.activatedBy = adminId;
            linkedSchedule.activatedAt = new Date();
            await linkedSchedule.save();
        }
    }

    logger.info("scheduleService: schedule activated (no trip generation yet — awaiting go-live)", { scheduleId, adminId });

    return schedule;
};

// ─── GO LIVE (BURST GENERATION) ───────────────────────────────────────────────

/**
 * Trigger trip burst generation for an ACTIVE schedule.
 * This is the SECOND phase of the two-phase activation:
 *   1. activateSchedule() → marks schedule ACTIVE, verifies fleet health
 *   2. goLiveSchedule()   → actually generates trips and opens bookings
 *
 * This separation prevents accidental trip generation when schedules are
 * activated from the BrandSchedulesTab or other management interfaces.
 * Only the Fleet Setup Wizard's final "Go Live" step calls this.
 */
const goLiveSchedule = async (scheduleId, adminId) => {
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) throw new Error("Schedule not found.");
    if (schedule.status !== "ACTIVE") {
        throw new Error(`Cannot go live on a schedule with status "${schedule.status}". Activate first.`);
    }

    logger.info("scheduleService: go-live triggered — starting burst generation", { scheduleId, adminId });

    // ── Burst-generate trips synchronously ────────────────────────────────────
    // Passengers can book right away. We await this so the UI is guaranteed
    // to have the trips ready when it redirects or refreshes.
    const windowDays = schedule.advanceGenerationDays || 60;
    
    try {
        // Generate for primary
        const primaryResult = await generateTripsForDateRange(scheduleId, new Date(), windowDays);
        logger.info("scheduleService: burst generation complete", { scheduleId, ...primaryResult, windowDays });
        
        // Generate for linked return schedule
        if (schedule.returnScheduleId) {
            const returnResult = await generateTripsForDateRange(schedule.returnScheduleId, new Date(), windowDays);
            logger.info("scheduleService: linked return burst generation complete", { scheduleId: schedule.returnScheduleId, ...returnResult, windowDays });
        }
    } catch (err) {
        logger.error("scheduleService: burst generation failed", { scheduleId, error: err.message });
        throw new Error("Failed to generate trips during go-live. " + err.message);
    }

    return schedule;
};

// ─── CREATE SCHEDULE VERSION ──────────────────────────────────────────────────

/**
 * Plan a future schedule version — the industry-standard way to change timings.
 *
 * Instead of mutating an ACTIVE schedule (which would corrupt bookings), this:
 *  1. Seals the current schedule: sets effectiveUntil = effectiveFrom - 1 day
 *  2. Creates a NEW schedule document with the updated timings
 *  3. Cross-links them: currentSchedule.pendingVersionId = newSchedule._id
 *                        newSchedule.parentScheduleId    = currentSchedule._id
 *  4. Auto-activates and burst-generates the new version from its effectiveFrom
 *
 * The current schedule keeps running until its sealed date — zero booking disruption.
 *
 * @param {string} scheduleId   - The ACTIVE schedule to supersede
 * @param {Object} changes      - { departureTime, arrivalTime, effectiveFrom, fareOverride?, notes? }
 * @param {string} adminId      - Admin performing the action
 */
const createScheduleVersion = async (scheduleId, changes, adminId) => {
    const { departureTime, arrivalTime, effectiveFrom, fareOverride, notes } = changes;

    if (!departureTime) throw new Error("New departureTime is required.");
    if (!arrivalTime)   throw new Error("New arrivalTime is required.");
    if (!effectiveFrom) throw new Error("effectiveFrom is required — when should the new version start?");

    if (!isValidTime(departureTime)) throw new Error("departureTime must be in HH:MM format.");
    if (!isValidTime(arrivalTime))   throw new Error("arrivalTime must be in HH:MM format.");

    const newStart = new Date(effectiveFrom);
    if (isNaN(newStart.getTime())) throw new Error("effectiveFrom must be a valid date.");
    if (newStart <= new Date())    throw new Error("effectiveFrom must be a future date.");

    const current = await Schedule.findById(scheduleId);
    if (!current) throw new Error("Schedule not found.");
    if (current.status !== "ACTIVE") {
        throw new Error(`Only ACTIVE schedules can be versioned. Current status: "${current.status}".`);
    }
    if (current.pendingVersionId) {
        throw new Error("This schedule already has a pending future version. Cancel it first.");
    }

    // Step 1: Seal the current schedule
    const sealDate = new Date(newStart);
    sealDate.setDate(sealDate.getDate() - 1);
    current.effectiveUntil = sealDate;

    // Step 2: Create the new version (copy all fields, override timings)
    const hour = parseInt(departureTime.split(":")[0]);
    const newVersion = new Schedule({
        brandId:               current.brandId,
        ownerId:               current.ownerId,
        busId:                 current.busId,
        variantId:             current.variantId,
        operatorRouteConfigId: current.operatorRouteConfigId,
        driverId:              current.driverId,
        seatTemplateId:        current.seatTemplateId,
        departureTime,
        arrivalTime,
        shift: hour < 12 ? "day" : "night",
        recurrence:            current.recurrence,
        daysOfWeek:            current.daysOfWeek,
        effectiveFrom:         newStart,
        effectiveUntil:        null,
        fareOverride:          fareOverride !== undefined ? fareOverride : current.fareOverride,
        advanceGenerationDays: current.advanceGenerationDays,
        advanceBookingDays:    current.advanceBookingDays,
        bookingCutoffHours:    current.bookingCutoffHours,
        returnScheduleId:      current.returnScheduleId,
        operationalModel:      current.operationalModel,
        layoverMinutes:        current.layoverMinutes,
        versionNumber:         (current.versionNumber || 1) + 1,
        parentScheduleId:      current._id,
        notes:                 notes || `v${(current.versionNumber || 1) + 1} — effective from ${sealDate.toLocaleDateString()}`,
        status:                "ACTIVE",
        activatedBy:           adminId,
        activatedAt:           new Date(),
        createdBy:             "ADMIN",
    });

    await newVersion.save();

    // Step 3: Cross-link and save the sealed current
    current.pendingVersionId = newVersion._id;
    await current.save();

    logger.info("scheduleService: schedule version created", {
        currentScheduleId: scheduleId,
        newVersionId:       newVersion._id,
        effectiveFrom:      newStart,
        sealedUntil:        sealDate,
        versionNumber:      newVersion.versionNumber,
    });

    // Step 4: Pre-generate trips for the new version starting from effectiveFrom
    try {
        const result = await generateTripsForDateRange(
            newVersion._id, newStart, current.advanceGenerationDays || 60
        );
        logger.info("scheduleService: version burst generation complete", {
            newVersionId: newVersion._id, ...result,
        });
    } catch (err) {
        logger.error("scheduleService: version burst generation failed", { error: err.message });
    }

    return { current, newVersion };
};

// ─── SUSPEND SCHEDULE ─────────────────────────────────────────────────────────

/**
 * Suspend an ACTIVE schedule.
 * Future trip generation stops immediately. Past/in-progress trips are unaffected.
 */
const suspendSchedule = async (scheduleId, adminId, reason, suspendUntil) => {
    if (!reason) throw new Error("Suspension reason is required.");

    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) throw new Error("Schedule not found.");
    if (schedule.status !== "ACTIVE") {
        throw new Error(`Cannot suspend a schedule with status "${schedule.status}".`);
    }

    schedule.status           = "SUSPENDED";
    schedule.suspendedBy      = adminId;
    schedule.suspendedAt      = new Date();
    schedule.suspensionReason = reason;
    schedule.suspendUntil     = suspendUntil ? new Date(suspendUntil) : null;
    await schedule.save();

    // F4 FIX: Auto-suspend linked return schedule if present
    if (schedule.returnScheduleId) {
        const linkedSchedule = await Schedule.findById(schedule.returnScheduleId);
        if (linkedSchedule && linkedSchedule.status === "ACTIVE") {
            linkedSchedule.status = "SUSPENDED";
            linkedSchedule.suspendedBy = adminId;
            linkedSchedule.suspendedAt = new Date();
            linkedSchedule.suspensionReason = `Auto-suspended with primary: ${reason}`;
            linkedSchedule.suspendUntil = suspendUntil ? new Date(suspendUntil) : null;
            await linkedSchedule.save();
        }
    }

    // F2 FIX: Self-healing setupComplete flag.
    // After suspending this schedule, check if the fleet has ANY remaining ACTIVE schedules.
    // If not, reset setupComplete to false — the fleet is no longer operationally live.
    const remainingActive = await Schedule.findOne({
        busId:  schedule.busId,
        _id:    { $ne: scheduleId },
        status: "ACTIVE",
    }).select("_id").lean();

    if (!remainingActive) {
        await Fleet.findByIdAndUpdate(schedule.busId, { setupComplete: false });
        logger.info("scheduleService: fleet setupComplete reset (no active schedules remain)", {
            busId: schedule.busId,
        });
    }

    logger.info("scheduleService: schedule suspended", { scheduleId, adminId, reason, suspendUntil });
    return schedule;
};

// ─── RESUME SCHEDULE ──────────────────────────────────────────────────────

/**
 * Resume a SUSPENDED schedule back to ACTIVE and re-generate the trip window.
 *
 * This is the dedicated endpoint for the Workstation's "Resume Operations" button.
 * It does NOT use the Setup Wizard — the wizard is only for first-time setup.
 *
 * On resume:
 *  1. Sets status back to ACTIVE and clears suspension fields
 *  2. Auto-resumes the linked return schedule if present
 *  3. Restores fleet.setupComplete to true
 *  4. Burst-generates the full advance window of trips from today forward
 */
const resumeSchedule = async (scheduleId, adminId) => {
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) throw new Error("Schedule not found.");
    if (schedule.status !== "SUSPENDED") {
        throw new Error(`Cannot resume a schedule with status "${schedule.status}". Only SUSPENDED schedules can be resumed.`);
    }

    // Clear all suspension fields and restore ACTIVE
    schedule.status           = "ACTIVE";
    schedule.suspendUntil     = null;
    schedule.suspensionReason = null;
    schedule.resumedBy        = adminId;
    schedule.resumedAt        = new Date();
    await schedule.save();

    // Auto-resume linked return schedule if also suspended
    if (schedule.returnScheduleId) {
        const linked = await Schedule.findById(schedule.returnScheduleId);
        if (linked && linked.status === "SUSPENDED") {
            linked.status           = "ACTIVE";
            linked.suspendUntil     = null;
            linked.suspensionReason = null;
            linked.resumedBy        = adminId;
            linked.resumedAt        = new Date();
            await linked.save();
        }
    }

    // Restore fleet setupComplete flag
    await Fleet.findByIdAndUpdate(schedule.busId, { setupComplete: true });

    // Burst-generate the full window from today forward
    const windowDays = schedule.advanceGenerationDays || 60;
    try {
        const primaryResult = await generateTripsForDateRange(scheduleId, new Date(), windowDays);
        logger.info("scheduleService: resume burst generation complete", { scheduleId, ...primaryResult, windowDays });

        if (schedule.returnScheduleId) {
            const returnResult = await generateTripsForDateRange(schedule.returnScheduleId, new Date(), windowDays);
            logger.info("scheduleService: resume linked return burst generation complete", {
                scheduleId: schedule.returnScheduleId, ...returnResult, windowDays
            });
        }
    } catch (err) {
        logger.error("scheduleService: resume burst generation failed", { scheduleId, error: err.message });
        throw new Error("Schedule resumed but trip generation failed. " + err.message);
    }

    logger.info("scheduleService: schedule resumed", { scheduleId, adminId });
    return schedule;
};

// ─── GET SCHEDULES ────────────────────────────────────────────────────────────

/**
 * Get all schedules for a specific brand, with rich populated data.
 */
const getSchedulesByBrand = async (brandId, filters = {}) => {
    const query = { brandId };
    if (filters.status) query.status = filters.status;

    return await Schedule.find(query)
        .populate("busId",      "busName busNumber busType vehicleType")
        .populate({
            path: "variantId",
            select: "name direction type",
            populate: {
                path: "corridorId",
                select: "code originId destinationId",
                populate: [
                    { path: "originId", select: "name code" },
                    { path: "destinationId", select: "name code" }
                ]
            }
        })
        .populate("driverId",   "fullName phone")
        .populate("seatTemplateId", "templateName totalSeats")
        .sort({ createdAt: -1 })
        .lean();
};

/**
 * Get all schedules for an owner across all their brands.
 */
const getSchedulesByOwner = async (ownerId, filters = {}) => {
    const query = { ownerId };
    if (filters.status) query.status = filters.status;
    if (filters.brandId) query.brandId = filters.brandId;

    return await Schedule.find(query)
        .populate("brandId",   "brandName")
        .populate("busId",     "busName busNumber")
        .populate("driverId",  "fullName phone")
        .sort({ brandId: 1, departureTime: 1 })
        .lean();
};

/**
 * Get all trips generated from a specific schedule.
 * Useful for the schedule detail view showing the full trip history.
 */
const getTripsBySchedule = async (scheduleId, filters = {}) => {
    const query = { scheduleId };
    if (filters.status) query.status = filters.status;
    if (filters.from && filters.to) {
        query.tripDate = {
            $gte: new Date(filters.from),
            $lte: new Date(filters.to),
        };
    }

    return await Trip.find(query)
        .select("tripId tripDate status driverId departureTime isAutoGenerated createdAt")
        .populate("driverId", "fullName phone")
        .sort({ tripDate: -1 })
        .lean();
};

/**
 * Get a single schedule by ID with full population.
 */
const getScheduleById = async (scheduleId) => {
    const schedule = await Schedule.findById(scheduleId)
        .populate("brandId",    "brandName commissionRate")
        .populate("busId",      "busName busNumber busType vehicleType approvalStatus status fleetId")
        .populate("variantId",  { path: "corridorId", populate: [{ path: "originId", select: "name code" }, { path: "destinationId", select: "name code" }] })
        .populate("driverId",   "fullName phone")
        .populate("seatTemplateId", "templateName totalSeats")
        .lean();
    if (!schedule) throw new Error("Schedule not found.");
    return schedule;
};

/**
 * Admin: paginated list of all schedules across the platform.
 */
const getAllSchedules = async ({ page = 1, limit = 30, status, brandId, busId } = {}) => {
    const query = {};
    if (status && status !== "all") query.status = status;
    if (brandId) query.brandId = brandId;
    if (busId)   query.busId   = busId;

    const skip = (page - 1) * limit;
    const [schedules, total] = await Promise.all([
        Schedule.find(query)
            .populate("brandId", "brandName")
            .populate("busId",   "busName busNumber")
            .populate("driverId","fullName phone")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Schedule.countDocuments(query),
    ]);

    return {
        schedules,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
};

/**
 * Update editable fields of a DRAFT or SUSPENDED schedule.
 * An ACTIVE schedule cannot be edited directly — it must be suspended first.
 * (This prevents mid-operation changes that could corrupt trip generation.)
 */
const updateSchedule = async (scheduleId, data) => {
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) throw new Error("Schedule not found.");

    if (schedule.status === "ACTIVE") {
        throw new Error(
            "Cannot edit an ACTIVE schedule. Suspend it first, make changes, then reactivate."
        );
    }
    if (schedule.status === "INACTIVE") {
        throw new Error("Cannot edit an INACTIVE schedule.");
    }

    const allowed = [
        "driverId", "seatTemplateId", "departureTime", "arrivalTime",
        "shift", "recurrence", "daysOfWeek", "effectiveFrom",
        "effectiveUntil", "fareOverride", "notes",
        // Booking window — can be tuned post-creation on DRAFT/SUSPENDED schedules
        "advanceBookingDays", "bookingCutoffHours", "advanceGenerationDays",
        // Return trip linking — set by the frontend after creating both schedules
        "returnScheduleId", "operationalModel", "layoverMinutes",
    ];
    for (const key of allowed) {
        if (data[key] !== undefined) schedule[key] = data[key];
    }

    if (data.departureTime && !isValidTime(data.departureTime))
        throw new Error("departureTime must be in HH:MM format.");
    if (data.arrivalTime && !isValidTime(data.arrivalTime))
        throw new Error("arrivalTime must be in HH:MM format.");
    if (data.recurrence || data.daysOfWeek) {
        validateRecurrence(schedule.recurrence, schedule.daysOfWeek);
    }

    await schedule.save();
    logger.info("scheduleService: schedule updated", { scheduleId });
    return schedule;
};

/**
 * Permanently deactivate a schedule (any status → INACTIVE).
 *
 * Industry standard: INACTIVE is a permanent soft-delete.
 * The schedule record is preserved for audit/financial history
 * but can never be reactivated — operator creates a new one instead.
 *
 * A schedule can only be deactivated if it has no UPCOMING confirmed trips.
 * Past (completed/cancelled) trips are fine — they are historical records.
 */
const deactivateSchedule = async (scheduleId, adminId, reason) => {
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) throw new Error("Schedule not found.");
    if (schedule.status === "INACTIVE") throw new Error("Schedule is already INACTIVE.");

    // Check for future scheduled trips that would be orphaned
    const now = new Date();
    const upcomingTrips = await Trip.countDocuments({
        scheduleId,
        tripDate: { $gte: now },
        status: "scheduled",
    });

    if (upcomingTrips > 0) {
        throw new Error(
            `Cannot deactivate: ${upcomingTrips} upcoming trip(s) are still scheduled. ` +
            `Cancel or reassign those trips before deactivating this schedule.`
        );
    }

    schedule.status           = "INACTIVE";
    schedule.suspendedBy      = adminId;
    schedule.suspendedAt      = new Date();
    schedule.suspensionReason = reason || "Permanently deactivated by admin.";
    await schedule.save();

    // F4 FIX: Auto-deactivate linked return schedule if present
    if (schedule.returnScheduleId) {
        const linkedSchedule = await Schedule.findById(schedule.returnScheduleId);
        if (linkedSchedule && linkedSchedule.status !== "INACTIVE") {
            const linkedUpcoming = await Trip.countDocuments({
                scheduleId: linkedSchedule._id,
                tripDate: { $gte: now },
                status: "scheduled",
            });
            if (linkedUpcoming === 0) {
                linkedSchedule.status = "INACTIVE";
                linkedSchedule.suspendedBy = adminId;
                linkedSchedule.suspendedAt = new Date();
                linkedSchedule.suspensionReason = `Auto-deactivated with primary: ${reason || "Permanently deactivated by admin."}`;
                await linkedSchedule.save();
            }
        }
    }

    // Reset fleet setupComplete if no active schedules remain
    const remainingActive = await Schedule.findOne({
        busId:  schedule.busId,
        _id:    { $ne: scheduleId },
        status: "ACTIVE",
    }).select("_id").lean();

    if (!remainingActive) {
        await Fleet.findByIdAndUpdate(schedule.busId, { setupComplete: false });
    }

    logger.info("scheduleService: schedule deactivated (INACTIVE)", { scheduleId, adminId });
    return schedule;
};

/**
 * Hard delete a DRAFT schedule.
 *
 * Industry standard: only DRAFT schedules (never activated) can be hard-deleted.
 * Once a schedule has been ACTIVE even briefly, it becomes part of the audit trail
 * and must be INACTIVE'd (soft-delete) instead.
 *
 * A DRAFT schedule cannot have trips — it was never activated, so the CRON
 * never generated any trips from it.
 */
const deleteSchedule = async (scheduleId) => {
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) throw new Error("Schedule not found.");

    if (schedule.status !== "DRAFT") {
        throw new Error(
            `Only DRAFT schedules can be hard-deleted. ` +
            `This schedule is ${schedule.status}. ` +
            `Use deactivate (INACTIVE) to permanently stop it instead.`
        );
    }

    // F4 FIX: Auto-delete linked return schedule if present
    if (schedule.returnScheduleId) {
        const linkedSchedule = await Schedule.findById(schedule.returnScheduleId);
        if (linkedSchedule && linkedSchedule.status === "DRAFT") {
            await Schedule.findByIdAndDelete(linkedSchedule._id);
            logger.info("scheduleService: linked DRAFT return schedule deleted", { scheduleId: linkedSchedule._id });
        }
    }

    await Schedule.findByIdAndDelete(scheduleId);
    logger.info("scheduleService: DRAFT schedule deleted", { scheduleId });
};

module.exports = {
    createSchedule,
    activateSchedule,
    goLiveSchedule,
    suspendSchedule,
    resumeSchedule,
    createScheduleVersion,
    deactivateSchedule,
    deleteSchedule,
    getSchedulesByBrand,
    getSchedulesByOwner,
    getTripsBySchedule,
    getScheduleById,
    getAllSchedules,
    updateSchedule,
};

