/**
 * controllers/adminController/refundController/adminRefundController.js
 *
 * Admin endpoints for managing the refund queue.
 * Operates on the Refund model (not the Booking model).
 */

const Refund = require("../../../models/refundModel.js");
const Booking = require("../../../models/bookTicketModel.js");
const User = require("../../../models/userModel.js");
const Trip = require("../../../models/tripModel.js");
const UserDeviceInfo = require("../../../models/userDeviceInfoModel.js");
const {
  createLocalNotification,
  notificationManager,
} = require("../../notificationController/notification_manager.js");

/**
 * GET /admin/refund/queue
 *
 * Returns all refund records with booking + user context.
 * Supports filtering by status and pagination.
 *
 * Query: ?status=pending|processing|completed|rejected&page=1&limit=20
 */
const getRefundQueue = async (req, res) => {
  try {
    const {
      status,
      search,
      page = 1,
      limit = 30,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (status && ["pending", "processing", "completed", "rejected"].includes(status)) {
      filter.status = status;
    }

    if (search && search.trim().length > 0) {
      const searchRegex = new RegExp(search.trim(), "i");
      
      // Find matching users or bookings
      const [matchingUsers, matchingBookings] = await Promise.all([
        User.find({
          $or: [{ name: searchRegex }, { phone: searchRegex }, { email: searchRegex }],
        }).select("_id").lean(),
        Booking.find({
          ticketId: searchRegex,
        }).select("_id").lean(),
      ]);

      const matchedUserIds = matchingUsers.map(u => u._id);
      const matchedBookingIds = matchingBookings.map(b => b._id);

      filter.$or = [
        { userId: { $in: matchedUserIds } },
        { bookingId: { $in: matchedBookingIds } },
        { refundGatewayId: searchRegex }
      ];
    }

    const [refunds, total] = await Promise.all([
      Refund.find(filter)
        .sort({ requestedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Refund.countDocuments(filter),
    ]);

    // Batch-fetch related data
    const userIds = [...new Set(refunds.map((r) => r.userId))];
    const bookingIds = [...new Set(refunds.map((r) => r.bookingId))];

    const [users, bookings] = await Promise.all([
      User.find({ _id: { $in: userIds } })
        .select("name phone email")
        .lean(),
      Booking.find({ _id: { $in: bookingIds } })
        .select("ticketId seats totalAmount tripId paymentMethod cancellationReason")
        .populate({
          path: "tripId",
          select: "tripDate departureTime fromStopName toStopName directionLabel",
          populate: {
            path: "routeId",
            select: "from to routeName",
          },
        })
        .lean(),
    ]);

    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const bookingMap = new Map(bookings.map((b) => [String(b._id), b]));

    const enriched = refunds.map((refund) => {
      const user = userMap.get(String(refund.userId));
      const booking = bookingMap.get(String(refund.bookingId));
      const trip = booking?.tripId;

      // Build route display
      let route = "N/A";
      if (trip?.routeId) {
        route = `${trip.routeId.from} → ${trip.routeId.to}`;
      } else if (trip?.directionLabel) {
        route = trip.directionLabel;
      } else if (trip?.fromStopName) {
        route = `${trip.fromStopName} → ${trip.toStopName || "?"}`;
      }

      return {
        _id: refund._id,
        status: refund.status,
        refundAmount: refund.refundAmount,
        cancellationCharge: refund.cancellationCharge,
        originalAmount: refund.originalAmount,
        reason: refund.reason,
        remarks: refund.remarks,
        refundGateway: refund.refundGateway,
        refundGatewayId: refund.refundGatewayId,
        requestedAt: refund.requestedAt,
        processedAt: refund.processedAt,
        completedAt: refund.completedAt,
        processedBy: refund.processedBy,
        user: user
          ? {
              _id: user._id,
              name: user.name,
              phone: user.phone,
              email: user.email,
            }
          : null,
        booking: booking
          ? {
              ticketId: booking.ticketId,
              seats: booking.seats,
              totalAmount: booking.totalAmount,
              paymentMethod: booking.paymentMethod,
              cancellationReason: booking.cancellationReason,
            }
          : null,
        route,
        tripDate: trip?.tripDate || null,
        departureTime: trip?.departureTime || null,
      };
    });

    // Summary counts
    const statusCounts = await Refund.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 }, totalAmount: { $sum: "$refundAmount" } } },
    ]);
    const summary = {};
    statusCounts.forEach((s) => {
      summary[s._id] = { count: s.count, totalAmount: s.totalAmount };
    });

    return res.status(200).json({
      status: true,
      message: "Refund queue fetched",
      data: enriched,
      summary,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("getRefundQueue error:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

/**
 * PATCH /admin/refund/update-status
 *
 * Transition a refund to a new status with audit trail.
 * Sends push notifications to the user on status changes.
 *
 * Body: { refundId, status, remarks?, refundGateway?, refundGatewayId? }
 */
const updateRefundStatus = async (req, res) => {
  try {
    const { refundId, status: newStatus, remarks, refundGateway, refundGatewayId } = req.body;
    const adminId = req.adminInfo?.id || req.userInfo?.id;

    if (!refundId || !newStatus) {
      return res.status(400).json({
        status: false,
        message: "refundId and status are required",
      });
    }

    const allowedStatuses = ["processing", "completed", "rejected"];
    if (!allowedStatuses.includes(newStatus)) {
      return res.status(400).json({
        status: false,
        message: `Invalid status. Allowed: ${allowedStatuses.join(", ")}`,
      });
    }

    const refund = await Refund.findById(refundId);
    if (!refund) {
      return res.status(404).json({ status: false, message: "Refund not found" });
    }

    // Validate transitions
    const validTransitions = {
      pending: ["processing", "completed", "rejected"],
      processing: ["completed", "rejected"],
      completed: [],
      rejected: [],
    };

    if (!validTransitions[refund.status]?.includes(newStatus)) {
      return res.status(400).json({
        status: false,
        message: `Cannot transition from '${refund.status}' to '${newStatus}'`,
      });
    }

    // Apply updates
    refund.status = newStatus;
    refund.processedBy = adminId;

    if (remarks) refund.remarks = remarks;
    if (refundGateway) refund.refundGateway = refundGateway;
    if (refundGatewayId) refund.refundGatewayId = refundGatewayId;

    if (newStatus === "processing") {
      refund.processedAt = new Date();
    } else if (newStatus === "completed") {
      refund.completedAt = new Date();
      if (!refund.processedAt) refund.processedAt = new Date();
    }

    await refund.save();

    // Send notification to user
    try {
      const booking = await Booking.findById(refund.bookingId).select("ticketId").lean();
      const ticketRef = booking?.ticketId || "your booking";

      let notifTitle, notifBody;
      if (newStatus === "processing") {
        notifTitle = "Refund Processing";
        notifBody = `Your refund of NPR ${refund.refundAmount} for ${ticketRef} is being processed.`;
      } else if (newStatus === "completed") {
        notifTitle = "Refund Completed";
        notifBody = `NPR ${refund.refundAmount} has been refunded for ${ticketRef}.`;
      } else if (newStatus === "rejected") {
        notifTitle = "Refund Rejected";
        notifBody = `Your refund request for ${ticketRef} was rejected.${remarks ? ` Reason: ${remarks}` : ""}`;
      }

      if (notifTitle) {
        await createLocalNotification(
          refund.userId,
          "REFUND_STATUS_UPDATE",
          notifTitle,
          notifBody,
          { refundId: refund._id, bookingId: refund.bookingId, status: newStatus }
        );

        const devices = await UserDeviceInfo.find({ userId: refund.userId });
        const tokens = devices.map((d) => d.token).filter(Boolean);
        if (tokens.length > 0) {
          await notificationManager(tokens, notifTitle, notifBody);
        }
      }
    } catch (notifErr) {
      console.error("Refund notification error:", notifErr);
    }

    return res.status(200).json({
      status: true,
      message: `Refund status updated to '${newStatus}'`,
      data: refund,
    });
  } catch (error) {
    console.error("updateRefundStatus error:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

module.exports = {
  getRefundQueue,
  updateRefundStatus,
};
