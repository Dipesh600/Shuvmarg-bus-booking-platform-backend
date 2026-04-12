const Bus = require("../../../models/fleetModel");
const User = require("../../../models/userModel");
const Trip = require("../../../models/tripModel");
const mongoose = require("mongoose");
const UserDeviceInfo = require("../../../models/userDeviceInfoModel");
const emailManager = require("../../../emailManager/emailManager");
const { notificationManager, createLocalNotification } = require("../../notificationController/notification_manager");
const sendOTP = require("../../../handlers/sparro-otp");

const getAllFleet = async (req, res) => {
    try {
        const fleets = await Bus.find()
            .populate("ownerId", "name email contactNumber")
            .sort({ createdAt: -1 });

        if (!fleets || fleets.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No fleets found"
            });
        }

        // Fetch routes for each fleet via Trips
        const enhancedFleets = await Promise.all(
            fleets.map(async (fleet) => {
                const lastTrip = await Trip.findOne({ busId: fleet._id })
                    .sort({ createdAt: -1 })
                    .populate("routeId", "routeName from to");

                return {
                    _id: fleet._id,
                    fleetId: fleet.fleetId,
                    busNumber: fleet.busNumber,
                    busName: fleet.busName,
                    operator: fleet.ownerId?.name || "N/A",
                    route: lastTrip?.routeId?.routeName || 
                           (lastTrip?.routeId?.from && lastTrip?.routeId?.to 
                               ? `${lastTrip.routeId.from} - ${lastTrip.routeId.to}` 
                               : "Not Assigned"),
                    seatCapacity: fleet.totalSeats || 0,
                    busType: fleet.busType,
                    approvedAt: fleet.approvedAt,
                    status: fleet.status,
                    approvalStatus: fleet.approvalStatus
                };
            })
        );

        res.status(200).json({
            success: true,
            message: "All fleets fetched successfully",
            results: enhancedFleets.length,
            data: enhancedFleets
        });
    } catch (error) {
        console.error("Error fetching fleets:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
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
        const [
            totalBuses,
            activeBuses,
            maintenanceBuses,
            pendingBuses
        ] = await Promise.all([
            Bus.countDocuments({}),
            Bus.countDocuments({ status: "ACTIVE" }),
            Bus.countDocuments({ status: "MAINTENANCE" }),
            Bus.countDocuments({ approvalStatus: "PENDING" })
        ]);

        res.status(200).json({
            success: true,
            message: "Fleet dashboard stats fetched successfully",
            data: {
                totalBuses,
                activeBuses,
                maintenanceBuses,
                pendingBuses
            }
        });
    } catch (error) {
        console.error("Error fetching fleet dashboard stats:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

module.exports = {
    getAllFleet,
    getFleetById,
    updateFleetStatus,
    getFleetDashboard
};