const Booking = require("../../../models/bookTicketModel.js");
const User = require("../../../models/userModel.js");
const Schedule = require("../../../models/busScheduleModel.js");

const getCancelledBookings = async (req, res) => {
    try {
        const bookings = await Booking.find({ status: "cancelled" });

        if (!bookings || bookings.length === 0) {
            return res.status(404).json({
                status: false,
                message: "No cancelled bookings found.",
            });
        }

        const enhancedBookings = await Promise.all(
            bookings.map(async (booking) => {
                const userInfo = await User.findById(booking.userId).lean();
                const scheduleInfo = await Schedule.findById(booking.scheduleId).lean();

                return {
                    ...booking._doc,
                    userInfo,
                    scheduleInfo,
                };
            })
        );

        return res.status(200).json({
            status: true,
            message: "Cancelled bookings fetched successfully!",
            results: enhancedBookings.length,
            data: enhancedBookings,
        });
    } catch (error) {
        console.error("Error fetching cancelled bookings:", error);
        return res.status(500).json({
            status: false,
            message: "Internal Server Error!",
        });
    }
};

const updateRefundStatus = async (req, res) => {
    try {
        const { bookingId, refundStatus } = req.body;

        if (!bookingId) {
            return res.status(400).json({
                status: false,
                message: "Booking ID is required.",
            });
        }

        const allowedStatuses = ["pending", "refunded", "not_applicable", "none"];
        if (!refundStatus || !allowedStatuses.includes(refundStatus)) {
            return res.status(400).json({
                status: false,
                message: `Invalid refund status. Allowed values: ${allowedStatuses.join(", ")}`,
            });
        }

        const booking = await Booking.findById(bookingId);

        if (!booking) {
            return res.status(404).json({
                status: false,
                message: "Booking not found.",
            });
        }

        booking.refundStatus = refundStatus;
        await booking.save();

        return res.status(200).json({
            status: true,
            message: "Refund status updated successfully!",
            data: booking,
        });
    } catch (error) {
        console.error("Error updating refund status:", error);
        return res.status(500).json({
            status: false,
            message: "Internal Server Error!",
        });
    }
};

module.exports = {
    getCancelledBookings,
    updateRefundStatus
};
