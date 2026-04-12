const Booking = require("../../../models/bookTicketModel.js");
const User = require("../../../models/userModel.js");
const Trip = require("../../../models/tripModel.js");
const mongoose = require("mongoose");

// Get all bookings
const getAllBookings = async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate("userId", "name email phone profilePicture")
      .populate({
        path: "tripId",
        populate: [
          {
            path: "busId",
            select: "busName busNumber busType"
          },
          {
            path: "routeId"
          }
        ]
      })
      .populate("couponUsed")
      .sort({ createdAt: -1 });

    const formattedBookings = bookings.map((booking) => ({
      _id: booking._id,
      ticketId: booking.ticketId,
      whoBooked: booking.userId?.name || "N/A",
      route: booking.tripId?.routeId?.routeName || 
             (booking.tripId?.routeId?.from && booking.tripId?.routeId?.to 
               ? `${booking.tripId.routeId.from} - ${booking.tripId.routeId.to}` 
               : "N/A"),
      seats: booking.seats.join(", "),
      passengers: booking.seats.length,
      amount: booking.totalAmount,
      date: booking.bookedAt,
      status: booking.status,
    }));

    return res.status(200).json({
      success: true,
      message: "All bookings retrieved successfully!",
      results: formattedBookings.length,
      data: formattedBookings,
    });
  } catch (error) {
    console.error("Error fetching all bookings:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// Get booking by ID
const getBookingById = async (req, res) => {
  try {
    const { bookingid } = req.params; 

    if (!bookingid) {
      return res.status(400).json({
        success: false,
        message: "Booking ID is required!",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(bookingid)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Booking ID format!",
      });
    }

    const booking = await Booking.findById(bookingid)
      .populate("userId", "name email phone profilePicture")
      .populate({
        path: "tripId",
        populate: [
          {
            path: "busId",
            select: "busName busNumber busType"
          },
          {
            path: "routeId"
          }
        ]
      })
      .populate("couponUsed");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found!",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Booking details retrieved successfully!",
      data: booking,
    });
  } catch (error) {
    console.error("Error fetching booking by ID:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// Get Bookings By User
const getBookingsByUser = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid userId.",
      });
    }

    const bookings = await Booking.find({ userId })
      .populate("userId", "name email phone")
      .populate({
        path: "tripId",
        populate: [
          {
            path: "busId",
            select: "busName busNumber busType"
          },
          {
            path: "routeId"
          }
        ]
      })
      .sort({ createdAt: -1 });

    if (!bookings || bookings.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No bookings found for this user.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User bookings fetched successfully!",
      results: bookings.length,
      data: bookings,
    });
  } catch (error) {
    console.error("Error fetching user bookings:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// Get Booking Stats for Dashboard
const getBookingStats = async (req, res) => {
  try {
    const [totalBookings, cancelledBookings, passengerData] = await Promise.all([
      Booking.countDocuments(),
      Booking.countDocuments({ status: "cancelled" }),
      Booking.aggregate([
        {
          $group: {
            _id: null,
            totalPassengers: { $sum: { $size: "$seats" } }
          }
        }
      ])
    ]);

    const totalPassengers = passengerData[0]?.totalPassengers || 0;
    const confirmationRate = totalBookings > 0 
      ? ((totalBookings - cancelledBookings) / totalBookings) * 100 
      : 0;

    return res.status(200).json({
      success: true,
      message: "Booking statistics retrieved successfully!",
      data: {
        totalBookings,
        totalPassengers,
        cancelledBookings,
        confirmationRate: confirmationRate.toFixed(2) + "%"
      }
    });
  } catch (error) {
    console.error("Error fetching booking stats:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

module.exports = {
  getAllBookings,
  getBookingById,
  getBookingsByUser,
  getBookingStats,
};
