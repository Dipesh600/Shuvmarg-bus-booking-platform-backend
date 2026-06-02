const Bus = require("../../../models/fleetModel");
const User = require("../../../models/userModel");
const Trip = require("../../../models/tripModel");
const Schedule = require("../../../models/scheduleModel");
const DriverProfile = require("../../../models/driverProfileModel");
const OperatorRouteConfig = require("../../../models/operatorRouteConfigModel");
const RouteVariant = require("../../../models/routeVariantModel");
const mongoose = require("mongoose");
const UserDeviceInfo = require("../../../models/userDeviceInfoModel");
const emailManager = require("../../../emailManager/emailManager");
const { notificationManager, createLocalNotification } = require("../../notificationController/notification_manager");
const sendOTP = require("../../../handlers/sparro-otp");

// ─── SETUP STATUS (D1) ─────────────────────────────────────────────────────────
// GET /fleets/:id/setup-status
// Returns which post-approval wizard steps are complete for this fleet.
// Used by the frontend wizard to show progress and guide the admin.
const getFleetSetupStatus = async (req, res) => {
    try {
        const fleet = await Bus.findById(req.params.id)
            .select("busName busNumber approvalStatus status corridorId routeRequestId brandId")
            .populate({
                path: "corridorId",
                select: "code originId destinationId",
                populate: [
                    { path: "originId", select: "name" },
                    { path: "destinationId", select: "name" }
                ]
            })
            .lean();

        if (!fleet) return res.status(404).json({ success: false, message: "Fleet not found." });

        // Step 1: Route assigned?
        const routeAssigned = !!(fleet.corridorId);

        // Step 2: OperatorRouteConfig exists for this specific bus's assigned corridor?
        let routeConfigured = false;
        let routeConfigsData = [];
        if (fleet.brandId && fleet.corridorId) {
            const variants = await RouteVariant.find({ corridorId: fleet.corridorId._id }).select("_id").lean();
            const variantIds = variants.map(v => v._id);
            if (variantIds.length > 0) {
                const routeConfigs = await OperatorRouteConfig.find({ 
                    brandId: fleet.brandId, 
                    status: "ACTIVE",
                    variantId: { $in: variantIds }
                })
                .populate({ path: "variantId", select: "name direction" })
                .select("_id activeStops status variantId")
                .lean();
                
                routeConfigured = routeConfigs.length > 0;
                routeConfigsData = routeConfigs;
            }
        }

        // Step 3: Is a driver explicitly assigned to this specific bus?
        const assignedDriver = await DriverProfile.findOne({ assignedBusId: fleet._id, approvalStatus: "APPROVED" }).select("_id fullName licenseType").lean();
        const driverAssigned = !!assignedDriver;

        // Step 4: Schedule exists for this bus?
        let outboundScheduleData = null;
        let returnScheduleData = null;
        let scheduleCreated = false;
        let returnTripLinked = false;
        let activated = false;

        const schedule = await Schedule.findOne({ busId: fleet._id })
            .select("_id status returnScheduleId departureTime arrivalTime operationalModel variantId")
            .populate({ path: "variantId", select: "name direction" })
            .lean();

        if (schedule) {
            scheduleCreated = true;
            outboundScheduleData = schedule;
            
            if (schedule.status === "ACTIVE") activated = true;

            // Step 5: Return trip linked?
            if (schedule.returnScheduleId) {
                returnTripLinked = true;
                returnScheduleData = await Schedule.findById(schedule.returnScheduleId)
                    .select("_id status returnScheduleId departureTime arrivalTime operationalModel variantId")
                    .populate({ path: "variantId", select: "name direction" })
                    .lean();
                
                if (returnScheduleData?.status === "ACTIVE") activated = true;
            }
        }

        // Determine next step
        const nextStep = !routeAssigned    ? "routeAssigned"
                       : !routeConfigured  ? "routeConfigured"
                       : !driverAssigned   ? "driverAssigned"
                       : !scheduleCreated  ? "scheduleCreated"
                       : !activated        ? "activated"
                       : "complete";

        return res.status(200).json({
            success: true,
            data: {
                fleetId: fleet._id,
                busName: fleet.busName,
                busNumber: fleet.busNumber,
                approvalStatus: fleet.approvalStatus,
                steps: {
                    routeAssigned,
                    routeConfigured,
                    driverAssigned,
                    scheduleCreated,
                    returnTripLinked,
                    activated,
                },
                nextStep,
                isFullyOperational: activated,
                scheduleId: schedule?._id || null,
                returnScheduleId: schedule?.returnScheduleId || null,
                assignedCorridor: fleet.corridorId || null,
                assignedRouteConfigs: routeConfigsData,
                assignedDriver,
                outboundScheduleData,
                returnScheduleData,
            },
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

const getAllFleet = async (req, res) => {
    try {
        const { operational, grounded, brandId, ownerId, approvalStatus } = req.query;

        const query = {};

        // ── Lifecycle-aware query modes ────────────────────────────────────────────
        //
        // ?operational=true  → Live Dispatch Board: buses that are fully configured
        //                      and have an active schedule. Uses the setupComplete
        //                      index on the Fleet document — one query, no join.
        //
        // ?grounded=true     → Grounded assets: APPROVED but no longer operational
        //                      (schedule suspended/deactivated). Stays on the Dispatch
        //                      Board so operators know they are missing a scheduled asset.
        //
        // default            → Full asset registry (Brand panel, KYC queue, etc.)
        //                      Returns all buses regardless of lifecycle state.
        //
        if (operational === "true") {
            query.setupComplete    = true;
            query.approvalStatus   = "APPROVED";
        } else if (grounded === "true") {
            query.setupComplete    = false;
            query.approvalStatus   = "APPROVED";
        } else {
            // Optionally filter by approval status when browsing asset registry
            if (approvalStatus) query.approvalStatus = approvalStatus;
        }

        // Scoped filters — work across all modes
        if (brandId) query.brandId = brandId;
        if (ownerId) query.ownerId = ownerId;

        const fleets = await Bus.find(query)
            .populate("ownerId", "name email contactNumber")
            .populate("corridorId", "code", null, {
                populate: [
                    { path: "originId",      select: "name" },
                    { path: "destinationId", select: "name" },
                ]
            })
            .sort({ createdAt: -1 })
            .lean();

        if (!fleets || fleets.length === 0) {
            const emptyMsg = operational === "true"
                ? "No buses are currently live on the network."
                : grounded === "true"
                ? "No grounded buses found."
                : "No fleets registered yet.";
            return res.status(200).json({ success: true, message: emptyMsg, results: 0, data: [] });
        }

        // Enrich each fleet with its active schedule summary (for the Dispatch Board)
        // Only run the schedule lookup for operational/grounded modes to avoid N+1 on
        // large brand-scoped registries.
        const needsSchedule = operational === "true" || grounded === "true";

        const enhancedFleets = await Promise.all(
            fleets.map(async (fleet) => {
                let scheduleInfo = null;
                if (needsSchedule) {
                    const primarySchedule = await Schedule.findOne({ busId: fleet._id, status: "ACTIVE" })
                        .select("departureTime arrivalTime operationalModel status returnScheduleId")
                        .lean();
                    if (primarySchedule) {
                        scheduleInfo = {
                            departureTime:    primarySchedule.departureTime,
                            arrivalTime:      primarySchedule.arrivalTime,
                            operationalModel: primarySchedule.operationalModel,
                            hasReturn:        !!primarySchedule.returnScheduleId,
                        };
                    }
                }

                return {
                    _id:            fleet._id,
                    fleetId:        fleet.fleetId,
                    busNumber:      fleet.busNumber,
                    busName:        fleet.busName,
                    busType:        fleet.busType,
                    vehicleType:    fleet.vehicleType,
                    totalSeats:     fleet.totalSeats || 0,
                    operator:       fleet.ownerId?.name || "N/A",
                    status:         fleet.status,
                    approvalStatus: fleet.approvalStatus,
                    setupComplete:  fleet.setupComplete || false,
                    approvedAt:     fleet.approvedAt,
                    brandId:        fleet.brandId,
                    // Corridor: origin → destination names from the platform registry
                    corridor: fleet.corridorId ? {
                        origin:      fleet.corridorId.originId?.name      || null,
                        destination: fleet.corridorId.destinationId?.name || null,
                        code:        fleet.corridorId.code                || null,
                    } : null,
                    // Live schedule summary — only populated in operational/grounded modes
                    schedule: scheduleInfo,
                };
            })
        );

        res.status(200).json({
            success: true,
            message: "Fleets fetched successfully",
            results: enhancedFleets.length,
            data:    enhancedFleets,
        });
    } catch (error) {
        console.error("Error fetching fleets:", error);
        res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
};

const getFleetById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid fleet ID format"
            });
        }

        const fleet = await Bus.findById(id)
            .populate("ownerId", "name email contactNumber address")
            .populate("amenitiesId")
            .populate("boardingPointId");

        if (!fleet) {
            return res.status(404).json({
                success: false,
                message: "Fleet not found"
            });
        }

        // Get recent trips for this fleet
        const recentTrips = await Trip.find({ busId: id })
            .sort({ createdAt: -1 })
            .limit(5)
            .populate("routeId");

        res.status(200).json({
            success: true,
            message: "Fleet details fetched successfully",
            data: {
                ...fleet.toObject(),
                recentTrips
            }
        });
    } catch (error) {
        console.error("Error fetching fleet by ID:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

const updateFleetStatus = async (req, res) => {
    try {
        const { status, rejectionReason, fleetId } = req.body;

        if (!["APPROVED", "REJECTED"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status. Allowed values: APPROVED, REJECTED"
            });
        }

        const bus = await Bus.findById(fleetId).populate("ownerId");

        if (!bus) {
            return res.status(404).json({
                success: false,
                message: "Bus not found"
            });
        }

        bus.approvalStatus = status;
        if (status === "APPROVED") {
            bus.status = "ACTIVE";
            bus.approvedAt = new Date();
            // bus.approvedBy = req.user._id; 
            bus.rejectionReason = null;
        } else {
            // bus.status = "INACTIVE"; 
            bus.rejectedAt = new Date();
            // bus.rejectedBy = req.user._id; 
            bus.rejectionReason = rejectionReason || "No reason provided";
        }

        await bus.save();

        const owner = bus.ownerId;
        if (owner) {
            const messageTitle = `Fleet Status Update: ${bus.busName} (${bus.busNumber})`;
            const messageBody = `Your bus fleet status has been updated to ${status}.${status === "REJECTED" ? ` Reason: ${bus.rejectionReason}` : ""}`;

            // 1. Email Notification
            if (owner.email) {
                const emailSubject = `Fleet Status Update - ${bus.busNumber}`;
                const emailHtml = `
                    <p>Dear ${owner.name},</p>
                    <p>${messageBody}</p>
                    <p><strong>Bus Details:</strong></p>
                    <ul>
                        <li>Bus Name: ${bus.busName}</li>
                        <li>Bus Number: ${bus.busNumber}</li>
                    </ul>
                    <p>Thank you.</p>
                `;
                await emailManager(owner.email, emailSubject, emailHtml);
            }

            // 2. Push Notification
            try {
                const devices = await UserDeviceInfo.find({ userId: owner._id });
                const tokens = devices.map(d => d.token).filter(Boolean);

                if (tokens.length > 0) {
                    await notificationManager(tokens, messageTitle, messageBody);
                }

                await createLocalNotification(owner._id, "FLEET_STATUS_UPDATE", messageTitle, messageBody, { fleetId: bus._id, status });
            } catch (notifyError) {
                console.error("Push Notification Error:", notifyError);
            }

            // 3. SMS Notification (Sparrow)
            if (owner.contactNumber) {
                try {
                    await sendOTP(owner.contactNumber, `${messageTitle}\n${messageBody}`);
                } catch (smsError) {
                    console.error("SMS Error:", smsError);
                }
            }
        }

        res.status(200).json({
            success: true,
            message: `Fleet status updated to ${status}`,
            data: bus
        });

    } catch (error) {
        console.error("Error updating fleet status:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

const getFleetDashboard = async (req, res) => {
    try {
        // ── Operationally meaningful stat definitions ──────────────────────────
        //
        // liveOnNetwork:  Buses that are fully operational — approved + setup complete.
        //                 These are the buses passengers can actually book.
        //
        // inGarage:       Approved buses that are not yet live (setup incomplete).
        //                 Operators need to finish the Fleet Setup Wizard for these.
        //
        // grounded:       Buses that WERE operational but are now suspended/deactivated.
        //                 Not booking-capable. Dispatch team should be aware.
        //
        // pendingApproval: Buses submitted by operators awaiting admin KYC sign-off.
        //
        // underMaintenance: Buses explicitly flagged as under service.
        //
        const [
            liveOnNetwork,
            inGarage,
            pendingApproval,
            underMaintenance,
            totalRegistered,
        ] = await Promise.all([
            Bus.countDocuments({ approvalStatus: "APPROVED", setupComplete: true,  status: { $ne: "MAINTENANCE" } }),
            Bus.countDocuments({ approvalStatus: "APPROVED", setupComplete: false, status: { $ne: "MAINTENANCE" } }),
            Bus.countDocuments({ approvalStatus: "PENDING" }),
            Bus.countDocuments({ status: "MAINTENANCE" }),
            Bus.countDocuments({}),
        ]);

        res.status(200).json({
            success: true,
            message: "Fleet dashboard stats fetched successfully",
            data: {
                // Legacy keys preserved for backward compat — mapped to new semantics
                totalBuses:       totalRegistered,
                activeBuses:      liveOnNetwork,
                maintenanceBuses: underMaintenance,
                pendingBuses:     pendingApproval,
                // New, semantically accurate keys for updated UI
                liveOnNetwork,
                inGarage,
                pendingApproval,
                underMaintenance,
                totalRegistered,
            }
        });
    } catch (error) {
        console.error("Error fetching fleet dashboard stats:", error);
        res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
};

module.exports = {
    getAllFleet,
    getFleetById,
    updateFleetStatus,
    getFleetDashboard,
    getFleetSetupStatus,
};