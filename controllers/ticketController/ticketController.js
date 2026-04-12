const Ticket = require("../../models/busScheduleModel.js");
const Seat = require("../../models/seatsModel.js");
const cloudinary = require("../../handlers/cloudinary.js");
const Booking = require("../../models/bookTicketModel.js");
const Review = require("../../models/reviewModel.js");
const { v4: uuidv4 } = require("uuid");
const User = require("../../models/userModel.js");
const UserDeviceInfo = require("../../models/userDeviceInfoModel.js");
const Coupon = require("../../models/couponModel.js");
const UserCouponUsage = require("../../models/userCouponUsageModel.js");
const sendSMS = require("../../handlers/sparro-otp.js");
const YatraPointsHistory = require("../../models/yatraPointsHistoryModel.js");
const Route = require("../../models/googleRouteModel.js");
const BusRoute = require("../../models/busRouteModel.js");
const {
  createLocalNotification,
  notificationManager,
} = require("../notificationController/notification_manager.js");
const Trip = require("../../models/tripModel");
const Transaction = require("../../models/transactionModel");
const Refund = require("../../models/refundModel");

const createTicket = async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ status: false, message: "your body is empty please add" });
    }
    const {
      operatorName,
      bussName,
      vehicleType,
      departureTime,
      arrivalTime,
      date,
      from,
      to,
      routeId,
      price,
      totalSeats,
      bussNo,
      totalTimeTaken,
      shift,
      boardingPoints,
      amenities,
    } = req.body;
    const getinfo = req.userInfo;
    console.log("my info", getinfo);
    console.log("My data", getinfo.role, getinfo.id);

    // const thumbnail = req.files?.thumbnail;

    // if (!thumbnail) {
    //   return res
    //     .status(400)
    //     .json({ status: false, message: "Thumbnail image is required." });
    // }

    if (
      !operatorName ||
      !bussName ||
      !vehicleType ||
      !departureTime ||
      !arrivalTime ||
      !from ||
      !to ||
      !price ||
      !totalSeats ||
      !bussNo ||
      !totalTimeTaken ||
      !shift
    ) {
      return res.status(400).json({
        status: false,
        message: "Missing required fields.",
      });
    }

    // Convert file buffer to base64 data URI
    // const base64Thumbnail = `data:${
    //   thumbnail.mimetype
    // };base64,${thumbnail.data.toString("base64")}`;
    // // Upload to Cloudinary
    // const result = await cloudinary.uploader.upload(base64Thumbnail, {
    //   folder: "buss_ticket_thumbnail",
    // });

    const yatrapoints = Math.round(price * 0.1);
    const newSchedule = await Ticket.create({
      operatorName,
      bussName,
      bussNo,
      vehicleType,
      departureTime,
      arrivalTime,
      date,
      route: { from, to },
      ...(routeId ? { routeId } : {}),
      price,
      yatrapoints,
      totalSeats,
      totalTimeTaken,
      shift,
      boardingPoints: boardingPoints || [], // Add boardingPoints with default empty array
      amenities: amenities || [], // Add amenities with default empty array
      thumbnail: null, // or result.secure_url if using cloudinary
      operatorId: getinfo.id,
      operatorRole: getinfo.role,
    });

    return res.status(201).json({
      status: true,
      message: "Bus ticket created!",
      data: newSchedule,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error!",
    });
  }
};

// Get My YatraPoints History
const getMyYatraHistory = async (req, res) => {
  try {
    const userId = req.userInfo.id;

    const history = await YatraPointsHistory.find({ userId })
      .sort({ createdAt: -1 })
      .limit(200);

    return res.status(200).json({
      status: true,
      message: "Successfully fetched YatraPoints history",
      data: history,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
    });
  }
};

// update code
const updateTicket = async (req, res) => {
  try {
    const getinfo = req.userInfo;
    const {
      operatorName,
      bussName,
      vehicleType,
      departureTime,
      arrivalTime,
      date,
      from,
      to,
      price,
      totalSeats,
      bussNo,
      totalTimeTaken,
      shift,
      ticketId,
      boardingPoints,
    } = req.body;

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res
        .status(404)
        .json({ status: false, message: "Ticket not found." });
    }

    // Optional: Check permission
    if (ticket.operatorId.toString() !== getinfo.id) {
      return res.status(403).json({
        status: false,
        message: "Unauthorized to update this ticket.",
      });
    }

    // If thumbnail is updated
    if (req.files?.thumbnail) {
      const thumbnail = req.files.thumbnail;
      const base64Thumbnail = `data:${thumbnail.mimetype
        };base64,${thumbnail.data.toString("base64")}`;
      const result = await cloudinary.uploader.upload(base64Thumbnail, {
        folder: "buss_ticket_thumbnail",
      });
      ticket.thumbnail = result.secure_url;
    }

    // Update ticket fields
    ticket.operatorName = operatorName || ticket.operatorName;
    ticket.bussName = bussName || ticket.bussName;
    ticket.vehicleType = vehicleType || ticket.vehicleType;
    ticket.departureTime = departureTime || ticket.departureTime;
    ticket.arrivalTime = arrivalTime || ticket.arrivalTime;
    ticket.bussNo = bussNo || ticket.bussNo;
    ticket.date = date || ticket.date;
    ticket.route = {
      from: from || ticket.route.from,
      to: to || ticket.route.to,
    };
    ticket.price = price || ticket.price;
    ticket.yatrapoints = price ? Math.round(price * 0.1) : ticket.yatrapoints;
    ticket.totalSeats = totalSeats || ticket.totalSeats;
    ticket.totalTimeTaken = totalTimeTaken || ticket.totalTimeTaken;
    ticket.shift = shift || ticket.shift;
    ticket.boardingPoints =
      boardingPoints !== undefined ? boardingPoints : ticket.boardingPoints;

    await ticket.save();

    return res.status(200).json({
      status: true,
      message: "Ticket updated successfully!",
      data: ticket,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: false, message: "Internal Server Error" });
  }
};

// Delete Ticket
const deleteTicket = async (req, res) => {
  try {
    const { ticketId } = req.body;
    const getinfo = req.userInfo;

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res
        .status(404)
        .json({ status: false, message: "Ticket not found." });
    }

    if (ticket.operatorId.toString() !== getinfo.id) {
      return res.status(403).json({
        status: false,
        message: "Unauthorized to delete this ticket.",
      });
    }
    // Delete thumbnail from cloudinary
    // const publicId = ticket.thumbnail.split('/').pop().split('.')[0];
    // await cloudinary.uploader.destroy(`buss_ticket_thumbnail/${publicId}`);

    await Ticket.findByIdAndDelete(ticketId);

    return res.status(200).json({
      status: true,
      message: "Ticket deleted successfully!",
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: false, message: "Internal Server Error" });
  }
};

// Get Ticket By Id
const getTicketById = async (req, res) => {
  try {
    const { ticketId } = req.body;
    const getinfo = req.userInfo;

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({
        status: false,
        message: "Ticket not found.",
      });
    }
    if (ticket.operatorId.toString() !== getinfo.id) {
      return res.status(403).json({
        status: false,
        message: "Unauthorized to get ticket!",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Ticket fetched successfully!",
      data: ticket,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error.",
    });
  }
};

// search ticket
const searchTickets = async (req, res) => {
  try {
    const { from, to, date, shift } = req.body;
    const query = { isActive: true };

    // Search by from/to cities using both BusRoute and Google Route
    if (from && to) {
      const fromRegex = new RegExp(from, "i");
      const toRegex = new RegExp(to, "i");

      // 1. Find matching BusRoutes by fromCity and toCity
      const busRoutes = await BusRoute.find({
        fromCity: { $regex: fromRegex },
        toCity: { $regex: toRegex },
        status: "ACTIVE",
      }).select("_id");

      const busRouteIds = busRoutes.map((r) => r._id);

      // 2. Find matching Google Routes by polyline addresses
      const googleRoutes = await Route.find({
        $and: [
          { polyline: { $elemMatch: { address: { $regex: fromRegex } } } },
          { polyline: { $elemMatch: { address: { $regex: toRegex } } } },
        ],
      }).select("_id");

      const googleRouteIds = googleRoutes.map((r) => r._id);

      // Build OR condition for both route types
      const orConditions = [];

      if (busRouteIds.length > 0) {
        orConditions.push({ busRouteId: { $in: busRouteIds } });
      }

      if (googleRouteIds.length > 0) {
        orConditions.push({ routeId: { $in: googleRouteIds } });
      }

      if (orConditions.length > 0) {
        query.$or = orConditions;
      } else {
        // No matching routes found in either source
        return res.json({
          status: true,
          message: "No bus schedules found for this route",
          results: 0,
          data: [],
        });
      }
    }

    // Filter by date
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0]; // "YYYY-MM-DD"

    if (date) {
      if (date.length === 4) {
        query.date = { $regex: `^${date}` }; // Year
      } else if (date.length === 7) {
        query.date = { $regex: `^${date}` }; // Month
      } else if (date.length === 10) {
        query.date = date; // Exact date
      }
    } else {
      // No date provided - filter schedules from today onward
      query.date = { $gte: todayStr };
    }

    // Shift filter
    if (shift) {
      if (Array.isArray(shift) && shift.length > 0) {
        query.shift = { $in: shift };
      } else if (typeof shift === "string") {
        query.shift = shift;
      }
    }

    const tickets = await Ticket.find(query)
      .select("-routeId -busRouteId -isActive -createdAt -updatedAt -__v")
      .populate({
        path: "busId",
        select: "thumbnail amenitiesId boardingPointId vehicleType _id busName busNumber busType totalSeats seatLayout fleetImages",
        populate: [
          { path: "amenitiesId", select: "-userId -_id -createdAt -updatedAt -__v" },
          { path: "boardingPointId", select: "-userId -_id -createdAt -updatedAt -__v" }
        ]
      })
      .populate({
        path: "busRouteId",
        select: "-createdAt -updatedAt -__v -status -userId -createdById"
      })
      .lean();

    const formattedTickets = tickets.map((ticket) => {
      const { busId, busRouteId, ...rest } = ticket;
      let busData = null;

      if (busId) {
        const { amenitiesId, boardingPointId, ...busRest } = busId;
        busData = {
          ...busRest,
          amenities: amenitiesId?.amenities || [],
          boardingPoints: boardingPointId?.boardingPoints || [],
        };
      }

      return {
        ...rest,
        busData,
        route: busRouteId
      };
    });

    res.json({
      status: true,
      message:
        formattedTickets.length === 0
          ? "No bus schedules found"
          : "Successfully fetched data",
      results: formattedTickets.length,
      data: formattedTickets,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, message: "Server error" });
  }
};



const searchTrips = async (req, res) => {
  try {
    const { from, to, date, shift } = req.body;
    console.log("Search Query:", { from, to, date, shift });

    // 1. Find the route(s) if from and to are provided
    let routeIds = [];
    if (from && to) {
      const routes = await BusRoute.find({
        from: new RegExp(`^${from.trim()}$`, 'i'),
        to: new RegExp(`^${to.trim()}$`, 'i'),
        status: "ACTIVE"
      });

      console.log("Found Routes:", routes.map(r => ({ id: r._id, name: r.routeName })));

      if (!routes.length) {
        return res.status(404).json({ success: false, message: "No routes found for these locations." });
      }
      routeIds = routes.map(r => r._id);
    }

    // 2. Build the trip query
    const tripQuery = {
      isActive: true,
      status: "scheduled"
    };

    if (routeIds.length > 0) {
      tripQuery.routeId = { $in: routeIds };
    }

    // Date filter
    if (date && date.trim() !== "") {
      tripQuery.tripDate = date.trim();
    }

    // Shift filter (day, night, or both)
    if (shift) {
      if (Array.isArray(shift)) {
        tripQuery.shift = { $in: shift };
      } else if (shift.toLowerCase() === "both") {
        // Do nothing, matches all shifts
      } else if (shift.trim() !== "") {
        tripQuery.shift = shift.trim().toLowerCase();
      }
    }

    console.log("Trip Query:", tripQuery);

    const trips = await Trip.find(tripQuery, "-createdAt -updatedAt -__v -isActive -daysOfWeek -autoGenerateUntil -seatTemplateId -isAutoGenerated -templateId -returnTripLinked -status -recurrence -ownerId")
      .populate({
        path: "busId",
        select: "busName busNumber busType vehicleType totalSeats seatLayout amenitiesId",
        populate: {
          path: "amenitiesId",
          select: "amenities"
        }
      })
      .populate("routeId", "routeName from to distance duration");

    // Transform the response to rename busId to busDetail and routeId to routeDetail
    const formattedTrips = trips.map(trip => {
      const tripObj = trip.toObject();

      // Flatten amenities to just an array of names
      let simplifiedAmenities = [];
      if (tripObj.busId && tripObj.busId.amenitiesId && tripObj.busId.amenitiesId.amenities) {
        simplifiedAmenities = tripObj.busId.amenitiesId.amenities.map(a => a.name);
      }

      const busDetail = {
        ...tripObj.busId,
        amenities: simplifiedAmenities,
        amenitiesId: undefined // Remove the original reference
      };

      return {
        ...tripObj,
        busDetail,
        routeDetail: tripObj.routeId,
        busId: undefined, // Remove the original keys
        routeId: undefined
      };
    });

    console.log("Found Trips Count:", formattedTrips.length);

    return res.status(200).json({
      success: true,
      message: "Trips found successfully",
      results: formattedTrips.length,
      data: formattedTrips
    });
  } catch (error) {
    console.error("searchTrips error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
};

const createSeats = async (req, res) => {
  try {
    const { tripId, scheduleId, seatRangeA, seatRangeB } = req.body;
    const effectiveTripId = tripId || scheduleId;

    // ... (rest of the code remains the same)
    if (!effectiveTripId || !seatRangeA || !seatRangeB) {
      return res.status(400).json({
        status: false,
        message: "Missing tripId or seat ranges.",
      });
    }

    // Helper to generate seat array like [{ seatNo: 'a1' }, { seatNo: 'a2' }, ...]
    const generateSeats = (prefix, range) => {
      const [start, end] = range.split("-").map(Number);
      const seats = [];

      for (let i = start; i <= end; i++) {
        seats.push({
          seatNo: `${prefix}${i}`,
          booked: false,
          bookedBy: null,
          bookedAt: null,
        });
      }

      return seats;
    };

    const seata = generateSeats("a", seatRangeA);
    const seatb = generateSeats("b", seatRangeB);

    const newSeats = await Seat.create({
      tripId: effectiveTripId,
      seata,
      seatb,
    });

    return res.status(201).json({
      status: true,
      message: "Seats created successfully!",
      data: newSeats,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error!",
    });
  }
};

// Get Seats by id
const getSeatsById = async (req, res) => {
  try {
    const { tripId } = req.body;

    if (!tripId) {
      return res.status(400).json({
        status: false,
        message: "Please Provide Trip Id!",
      });
    }

    const seats = await Seat.findOne({ tripId: tripId });
    if (!seats) {
      return res.status(404).json({
        status: false,
        message: "Seats Not Found!",
      });
    }
    return res.status(200).json({
      status: true,
      message: "Successfully fetched seats!",
      data: seats,
    });
  } catch (e) {
    return res.status(500).json({
      status: true,
      message: "Internal Server Error!",
    });
  }
};

// Book Ticket
const bookTicket = async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ status: false, message: "your body is empty please add" });
    }
    const {
      tripId,
      seatNumbers,
      gateway,
      transactionId,
    } = req.body;
    const effectiveTripId = tripId;
    const userId = req.userInfo.id;

    if (
      !effectiveTripId ||
      !seatNumbers ||
      seatNumbers.length === 0 ||
      !gateway ||
      !transactionId
    ) {
      return res
        .status(400)
        .json({ status: false, message: "Missing required fields." });
    }

    const normalizedSeats = seatNumbers.map((seat) => seat.toLowerCase());

    // Fetch Trip details to get the price
    const trip = await Trip.findById(effectiveTripId).populate("routeId");
    if (!trip) {
      return res.status(404).json({ status: false, message: "Trip not found!" });
    }

    // Determine price: Use tripFare if not null, otherwise use route basePrice
    const tripPrice = trip.tripFare !== null ? trip.tripFare : trip.routeId.basePrice;
    const totalAmount = tripPrice * seatNumbers.length;
    const baseFare = tripPrice;

    const seatDoc = await Seat.findOne({ tripId: effectiveTripId });

    if (!seatDoc) {
      return res
        .status(404)
        .json({ status: false, message: "Seat data not found for trip." });
    }

    if (!userId) {
      return res
        .status(400)
        .json({ status: false, message: "User Id is required!" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ status: false, message: "User not found!" });
    }

    const allSeats = [...seatDoc.seata, ...seatDoc.seatb, ...seatDoc.seatc];

    const alreadyBookedSeats = [];
    const invalidSeats = [];

    normalizedSeats.forEach((seatNo) => {
      const seat = allSeats.find((s) => s.seatNo === seatNo);
      if (!seat) {
        invalidSeats.push(seatNo.toUpperCase());
      } else if (seat.booked) {
        alreadyBookedSeats.push(seatNo.toUpperCase());
      }
    });

    if (invalidSeats.length > 0) {
      return res.status(400).json({
        status: false,
        message: `Invalid seat(s): ${invalidSeats.join(", ")}`,
      });
    }

    if (alreadyBookedSeats.length > 0) {
      return res.status(400).json({
        status: false,
        message: `Seat ${alreadyBookedSeats.join(", ")} is already booked!`,
      });
    }

    normalizedSeats.forEach((seat) => {
      const rowPrefix = seat.charAt(0);
      const seatKey = `seat${rowPrefix}`;
      const seatObj = seatDoc[seatKey].find((s) => s.seatNo === seat);
      if (seatObj) {
        seatObj.booked = true;
        seatObj.bookedBy = userId;
        seatObj.bookedAt = new Date();
      }
    });

    await seatDoc.save();

    const generateTicketId = () => {
      const date = new Date();
      const dateStr = date.toISOString().split("T")[0].replace(/-/g, "");
      const randomNum = Math.floor(1000 + Math.random() * 90000);
      return `TKT-${dateStr}-${randomNum}`;
    };

    const ticketId = generateTicketId();

    // Check if a coupon code was provided
    let couponData = null;
    let originalAmount = totalAmount;
    let finalAmount = totalAmount;
    let discountAmount = 0;

    // If coupon code was provided in the request
    if (req.body.couponCode && req.body.couponCode.trim() !== "") {
      try {
        const code = req.body.couponCode.trim().toUpperCase();
        const coupon = await Coupon.findOne({ couponCode: code });
        if (!coupon) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_NOT_FOUND",
            message: "Invalid coupon code",
          });
        }
        if (!coupon.isActive) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_INACTIVE",
            message: "Coupon is disabled",
          });
        }
        const now = new Date();
        if (now < coupon.validFrom) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_NOT_ACTIVE_YET",
            message: `Coupon isn't active yet. Starts on ${coupon.validFrom.toISOString().slice(0, 10)}`,
          });
        }
        if (now > coupon.validTo) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_EXPIRED",
            message: "Coupon expired. You can't use it.",
          });
        }
        if (
          coupon.totalUsageLimit !== null &&
          typeof coupon.totalUsageLimit === "number" &&
          coupon.usedCount >= coupon.totalUsageLimit
        ) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_USAGE_LIMIT_REACHED",
            message: "Coupon usage limit reached",
          });
        }
        if (
          Array.isArray(coupon.applicableUserTypes) &&
          coupon.applicableUserTypes.length > 0 &&
          !coupon.applicableUserTypes.includes(req.userInfo.role)
        ) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_NOT_APPLICABLE_FOR_USER",
            message: "Coupon is not applicable for your user type",
          });
        }
        if (
          Array.isArray(coupon.applicableRoutes) &&
          coupon.applicableRoutes.length > 0 &&
          !coupon.applicableRoutes.some((r) => String(r) === String(effectiveTripId))
        ) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_NOT_APPLICABLE_FOR_ROUTE",
            message: "Coupon is not applicable for this route",
          });
        }
        if (
          Array.isArray(coupon.excludedRoutes) &&
          coupon.excludedRoutes.some((r) => String(r) === String(effectiveTripId))
        ) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_EXCLUDED_FOR_ROUTE",
            message: "Coupon cannot be used for this route",
          });
        }
        if (
          typeof coupon.minOrderAmount === "number" &&
          totalAmount < coupon.minOrderAmount
        ) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_MIN_ORDER_NOT_MET",
            message: `Order must be at least ₹${coupon.minOrderAmount} to use this coupon`,
          });
        }

        const userUsageCount = await UserCouponUsage.getUserCouponUsageCount(
          userId,
          coupon._id
        );
        if (userUsageCount >= coupon.perUserLimit) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_PER_USER_LIMIT_REACHED",
            message: "You have already used this coupon",
          });
        }

        discountAmount = coupon.calculateDiscount(totalAmount);
        discountAmount = Math.round(discountAmount * 100) / 100;
        finalAmount = totalAmount - discountAmount;

        couponData = {
          couponId: coupon._id,
          couponCode: coupon.couponCode,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
        };
      } catch (error) {
        console.error("Error processing coupon:", error);
        return res.status(500).json({
          status: false,
          message: "Error validating coupon",
        });
      }
    }

    // Handle YatraPoints discount if provided
    let yatraPointsUsed = 0;
    let yatraPointsDiscount = 0;

    if (req.body.yatrapointsToUse && req.body.yatrapointsToUse > 0) {
      try {
        const yatraPointsToUse = parseInt(req.body.yatrapointsToUse);

        // Check if user has enough points
        if (yatraPointsToUse <= user.yatrapoints) {
          // Calculate discount: 100 points = 1% discount
          const discountPercentage = (yatraPointsToUse / 100) * 1;
          yatraPointsDiscount = (finalAmount * discountPercentage) / 100;

          // Ensure discount doesn't exceed the final amount
          yatraPointsDiscount = Math.min(yatraPointsDiscount, finalAmount);
          yatraPointsDiscount = Math.round(yatraPointsDiscount * 100) / 100;

          // Update final amount
          finalAmount = finalAmount - yatraPointsDiscount;
          yatraPointsUsed = yatraPointsToUse;

          // Deduct points from user's account
          console.log(
            `Before deduction - User ${userId} has ${user.yatrapoints} points`
          );

          const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $inc: { yatrapoints: -yatraPointsUsed } },
            { new: true }
          );

          // Record YatraPoints redeem history
          try {
            await YatraPointsHistory.create({
              userId,
              type: "redeem",
              points: yatraPointsUsed,
              balanceBefore: user.yatrapoints,
              balanceAfter: updatedUser.yatrapoints,
              tripId: effectiveTripId,
              description: `Redeemed ${yatraPointsUsed} points for discount`,
              meta: { discountAmount: yatraPointsDiscount },
            });
          } catch (histErr) {
            console.error(
              "Failed to record YatraPoints redeem history:",
              histErr
            );
          }

          console.log(
            `User ${userId} used ${yatraPointsUsed} yatrapoints for ₹${yatraPointsDiscount} discount. Remaining points: ${updatedUser.yatrapoints}`
          );
        } else {
          return res.status(400).json({
            status: false,
            message: `Insufficient yatrapoints. You have ${user.yatrapoints} points available`,
          });
        }
      } catch (error) {
        console.error("Error processing yatrapoints:", error);
        return res.status(500).json({
          status: false,
          message: "Error processing yatrapoints. Please try again.",
        });
      }
    }

    // Create the booking with coupon and yatrapoints information
    const booking = await Booking.create({
      userId,
      tripId: effectiveTripId,
      seats: normalizedSeats,
      originalAmount: originalAmount,
      discountAmount: discountAmount + yatraPointsDiscount, // Total discount from both coupon and yatrapoints
      totalAmount: finalAmount,
      couponCode: couponData ? couponData.couponCode : null,
      couponUsed: couponData ? couponData.couponId : null,
      yatraPointsUsed: yatraPointsUsed,
      yatraPointsDiscount: yatraPointsDiscount,
      ticketId,
    });

    // Create a transaction record
    try {
      await Transaction.create({
        userId,
        bookingId: booking._id,
        ticketId,
        transactionType: "BOOKING",
        gateway,
        transactionId,
        originalAmount: baseFare,
        totalAmount: finalAmount,
        status: "SUCCESS",
        paidAt: new Date(),
      });
    } catch (transErr) {
      console.error("Failed to create transaction record:", transErr);
      // We don't fail the booking if transaction logging fails, but it's important to log it.
    }

    // Link the latest redeem history (if any) to this booking
    if (yatraPointsUsed > 0) {
      try {
        await YatraPointsHistory.findOneAndUpdate(
          { userId, type: "redeem", tripId: effectiveTripId, bookingId: null },
          { $set: { bookingId: booking._id, ticketId } },
          { sort: { createdAt: -1 } }
        );
      } catch (linkErr) {
        console.error("Failed to link redeem history to booking:", linkErr);
      }
    }

    // Record coupon usage if a coupon was used
    if (couponData) {
      try {
        // Create usage record
        await UserCouponUsage.create({
          userId,
          couponId: couponData.couponId,
          couponCode: couponData.couponCode,
          bookingId: booking._id,
          ticketId,
          originalAmount,
          discountAmount,
          finalAmount,
          status: "active",
        });

        // Increment coupon's usage count
        await Coupon.findByIdAndUpdate(couponData.couponId, {
          $inc: { usedCount: 1 },
        });

        console.log(
          `Coupon ${couponData.couponCode} usage recorded for booking ${booking._id}`
        );
      } catch (error) {
        console.error("Error recording coupon usage:", error);
        // Don't fail the booking if coupon recording fails
      }
    }

    const rewardPoint = finalAmount * 0.1; // Calculate reward points on final amount after discount

    const userAfterEarn = await User.findByIdAndUpdate(
      userId,
      { $inc: { yatrapoints: rewardPoint } },
      { new: true }
    );
    // Record YatraPoints earn history
    try {
      await YatraPointsHistory.create({
        userId,
        type: "earn",
        points: rewardPoint,
        balanceBefore: userAfterEarn.yatrapoints - rewardPoint,
        balanceAfter: userAfterEarn.yatrapoints,
        bookingId: booking._id,
        tripId: effectiveTripId,
        ticketId,
        description: `Earned ${rewardPoint} points for booking`,
        meta: {
          originalAmount,
          finalAmount,
          seats: normalizedSeats,
        },
      });
    } catch (histErr) {
      console.error("Failed to record YatraPoints earn history:", histErr);
    }

    // Fetch trip details for notifications and SMS
    const tripDetails = await Trip.findById(effectiveTripId).populate("routeId");

    // Create route information for notifications
    const routeInfo = tripDetails && tripDetails.routeId
      ? `${tripDetails.routeId.from} to ${tripDetails.routeId.to}`
      : "Route information not available";

    await createLocalNotification(
      userId,
      "BOOKING_CONFIRMED",
      "Ticket Booked Successfully",
      `Your ticket (${ticketId}) for ${routeInfo} has been booked.`,
      { effectiveTripId, seats: normalizedSeats, totalAmount, route: routeInfo }
    );

    const userDevices = await UserDeviceInfo.find({ userId });
    const tokens = userDevices.map((device) => device.token).filter(Boolean);
    // Send push notification if tokens exist
    if (tokens.length > 0) {
      await notificationManager(
        tokens,
        "Ticket Booked Successfully",
        `Your ticket (${ticketId}) for ${routeInfo} has been booked.`
      );
    }

    // Format seats for better readability
    const formattedSeats = normalizedSeats
      .map((seat) => seat.toUpperCase())
      .join(", ");

    // Send SMS notification with ticket details
    if (req.userInfo.phone) {
      try {
        // Format the SMS message with all required details
        const smsMessage = `
Hello ${req.userInfo.name},

Your ticket has been booked successfully!
Ticket ID: ${ticketId}
Route: ${tripDetails.routeId.from} to ${tripDetails.routeId.to}
Date: ${tripDetails.tripDate}
Time: ${tripDetails.departureTime}
Seats: ${formattedSeats}
${discountAmount > 0 ? `Discount: ₹${discountAmount}` : ""}
Amount: ₹${finalAmount}

Thank you for booking with us!
        `.trim();

        // Send the SMS
        await sendSMS(req.userInfo.phone, smsMessage);
        console.log(
          `SMS notification sent to ${req.userInfo.phone} for ticket ${ticketId}`
        );
      } catch (smsError) {
        console.error("Error sending SMS notification:", smsError);
        // Don't fail the booking if SMS sending fails
      }
    }

    res.status(201).json({
      status: true,
      message: "Ticket booked successfully!",
      ticketId,
      data: {
        originalAmount,
        couponDiscount: discountAmount,
        yatraPointsDiscount: yatraPointsDiscount,
        totalDiscount: discountAmount + yatraPointsDiscount,
        finalAmount,
        couponUsed: couponData ? couponData.couponCode : null,
        yatraPointsUsed: yatraPointsUsed,
        yatrapointsEarned: Math.round(rewardPoint),
        currentYatraPoints: userAfterEarn?.yatrapoints,
        seats: normalizedSeats,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

// Cancel Ticket
const cancelTicket = async (req, res) => {
  try {
    const { ticketId, cancelReason } = req.body;
    const userId = req.userInfo.id;

    if (!ticketId) {
      return res.status(400).json({
        status: false,
        message: "ticketId is required",
      });
    }

    // Find booking by ticketId
    const booking = await Booking.findOne({ ticketId });
    if (!booking) {
      return res
        .status(404)
        .json({ status: false, message: "Booking not found" });
    }

    // Ensure the booking belongs to the requesting user
    if (booking.userId.toString() !== userId) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to cancel this booking",
      });
    }

    // Only cancel if current status is booked
    if (booking.status !== "booked") {
      return res.status(400).json({
        status: false,
        message: `Cannot cancel a booking with status '${booking.status}'`,
      });
    }

    // Free the seats in Seat collection
    const seatDoc = await Seat.findOne({ tripId: booking.tripId });
    if (!seatDoc) {
      return res.status(404).json({
        status: false,
        message: "Seat data not found for trip.",
      });
    }

    // Helper to free a seat from seata, seatb, or seatc
    const freeSeat = (seatNo) => {
      const rowPrefix = seatNo.charAt(0).toLowerCase();
      const seatKey = `seat${rowPrefix}`; // 'seata', 'seatb', or 'seatc'
      const seatObj = seatDoc[seatKey]?.find((s) => s.seatNo === seatNo);
      if (seatObj) {
        seatObj.booked = false;
        seatObj.bookedBy = null;
        seatObj.bookedAt = null;
      }
    };

    booking.seats.forEach((s) => freeSeat(s.toLowerCase()));

    // Mark modified for nested arrays if needed (though find/update usually works)
    seatDoc.markModified('seata');
    seatDoc.markModified('seatb');
    seatDoc.markModified('seatc');
    await seatDoc.save();

    // Handle Refund Creation based on new model requirements
    const originalAmount = booking.totalAmount || 0;
    const cancellationCharge = 0; // Currently no cancellation rule, set to 0
    const refundAmount = originalAmount; // Same as original for now

    await Refund.create({
      bookingId: booking._id,
      originalAmount: originalAmount,
      cancellationCharge: cancellationCharge,
      refundAmount: refundAmount,
      status: "pending",
      requestedAt: new Date(),
      reason: cancelReason || "User cancelled"
    });

    // Update booking status
    booking.status = "cancelled";

    await booking.save();

    // Prepare and send notifications (local + push)
    try {
      // Fetch trip details for route info
      const tripDetails = await Trip.findById(booking.tripId).populate("routeId");
      const routeInfo = tripDetails?.routeId
        ? `${tripDetails.routeId.from} to ${tripDetails.routeId.to}`
        : "Route information not available";

      // Create local notification entry
      await createLocalNotification(
        userId,
        "TICKET_CANCELLED",
        "Booking Cancelled",
        `Your booking (${booking.ticketId}) for ${routeInfo} has been cancelled${cancelReason ? `: ${cancelReason}` : "."}`,
        {
          tripId: booking.tripId,
          seats: booking.seats,
          ticketId: booking.ticketId,
          route: routeInfo,
        }
      );

      // Send push notification to user's devices
      const userDevices = await UserDeviceInfo.find({ userId });
      const tokens = userDevices.map((device) => device.token).filter(Boolean);
      if (tokens.length > 0) {
        await notificationManager(
          tokens,
          "Booking Cancelled",
          `Your booking (${booking.ticketId}) for ${routeInfo} has been cancelled.`
        );
      }
    } catch (notifyErr) {
      console.error("Error sending cancellation notifications:", notifyErr);
      // Do not fail the request if notifications fail
    }

    return res.status(200).json({
      status: true,
      message: "Booking cancelled successfully",
      data: {
        ticketId: booking.ticketId,
        status: booking.status,
        refundStatus: booking.refundStatus,
        refundAmount: booking.refundAmount,
        seats: booking.seats,
      },
    });
  } catch (error) {
    console.error("Cancel Ticket Error:", error);
    return res
      .status(500)
      .json({ status: false, message: "Internal Server Error" });
  }
};

// Get My ticket history
const getMyTicketHistory = async (req, res) => {
  try {
    const userId = req.userInfo.id;

    const bookings = await Booking.find({ userId: userId })
      .populate({
        path: "tripId",
        populate: [
          {
            path: "busId",
            select:
              "busName busNumber busType vehicleType totalSeats seatLayout amenitiesId boardingPointId fleetImages",
            populate: [
              {
                path: "amenitiesId",
                select: "amenities",
              },
              {
                path: "boardingPointId",
                select: "city boardingPoints description",
              },
            ],
          },
          {
            path: "routeId",
            select: "routeName from to distance duration basePrice",
          },
        ],
      })
      .lean();

    const bookingIds = bookings.map((b) => b._id);

    const transactions = await Transaction.find({
      bookingId: { $in: bookingIds },
    })
      .select({
        bookingId: 1,
        gateway: 1,
        transactionId: 1,
        status: 1,
        totalAmount: 1,
        paidAt: 1,
      })
      .lean();
    const transactionByBookingId = new Map(
      transactions.map((t) => [String(t.bookingId), t])
    );

    const foundReviews = await Review.find({
      userId: userId,
      bookingId: { $in: bookingIds },
    })
      .select({ bookingId: 1 })
      .lean();
    const reviewedSet = new Set(foundReviews.map((r) => String(r.bookingId)));

    const result = bookings.map((booking) => {
      const transaction = transactionByBookingId.get(String(booking._id)) || null;

      let trip = booking.tripId || null;

      if (trip && trip.busId) {
        const bus = trip.busId;

        trip.busId = {
          ...bus,
          amenitiesDetail: bus.amenitiesId || null,
          boardingPointDetail: bus.boardingPointId || null,
          amenitiesId: undefined,
          boardingPointId: undefined,
        };
      }

      if (trip) {
        trip = {
          ...trip,
          routeDetail: trip.routeId || null,
          routeId: undefined,
        };
      }

      return {
        booking: {
          seats: booking.seats,
          totalAmount: booking.totalAmount,
          status: booking.status,
          refundStatus: booking.refundStatus,
          refundAmount: booking.refundAmount,
          ticketId: booking.ticketId,
          bookingId: booking._id,
          review: reviewedSet.has(String(booking._id)),
        },
        trip,
        payment: transaction
          ? {
            gateway: transaction.gateway,
            transactionId: transaction.transactionId,
            status: transaction.status,
            totalAmount: transaction.totalAmount,
            paidAt: transaction.paidAt,
          }
          : null,
      };
    });

    return res.status(200).json({
      status: true,
      message: "Successfully fetched Booking History",
      data: result,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
    });
  }
};

// Validate YatraPoints for discount
const validateYatraPoints = async (req, res) => {
  try {
    const { yatrapointsToUse, scheduleId, seatNumbers } = req.body;
    const userId = req.userInfo.id;

    if (
      !yatrapointsToUse ||
      !scheduleId ||
      !seatNumbers ||
      seatNumbers.length === 0
    ) {
      return res.status(400).json({
        status: false,
        message: "yatrapointsToUse, scheduleId, and seatNumbers are required",
      });
    }

    // Validate input
    if (yatrapointsToUse < 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid yatrapoints amount",
      });
    }

    // Get schedule details and validate
    const schedule = await Ticket.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({
        status: false,
        message: "Schedule not found",
      });
    }

    // Calculate total amount from schedule price and number of seats
    const totalAmount = schedule.price * seatNumbers.length;

    // Get user's current yatrapoints
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    const userYatraPoints = user.yatrapoints || 0;

    // Check if user has enough points
    if (yatrapointsToUse > userYatraPoints) {
      return res.status(400).json({
        status: false,
        message: `Insufficient yatrapoints! You only have ${userYatraPoints} points available, but trying to use ${yatrapointsToUse} points.`,
        errorCode: "INSUFFICIENT_YATRAPOINTS",
        data: {
          requestedPoints: yatrapointsToUse,
          availablePoints: userYatraPoints,
          shortfall: yatrapointsToUse - userYatraPoints,
          maxDiscountPossible:
            Math.round((userYatraPoints / 100) * 1 * 100) / 100, // Max % discount possible
          suggestion:
            userYatraPoints > 0
              ? `You can use up to ${userYatraPoints} points for ${Math.round((userYatraPoints / 100) * 1 * 100) / 100
              }% discount`
              : "You need to earn more yatrapoints to get discounts",
        },
      });
    }

    // Calculate discount: 100 points = 1% discount
    const discountPercentage = (yatrapointsToUse / 100) * 1; // 1% per 100 points
    const discountAmount = (totalAmount * discountPercentage) / 100;

    // Ensure discount doesn't exceed the total amount
    const finalDiscountAmount = Math.min(discountAmount, totalAmount);
    const finalAmount = totalAmount - finalDiscountAmount;

    // Round to 2 decimal places
    const roundedDiscountAmount = Math.round(finalDiscountAmount * 100) / 100;
    const roundedFinalAmount = Math.round(finalAmount * 100) / 100;

    return res.status(200).json({
      status: true,
      message: "YatraPoints validation successful",
      data: {
        // originalAmount: totalAmount,
        finalAmount: roundedFinalAmount,

        // scheduleId,
        // scheduleDetails: {
        //   from: schedule.route.from,
        //   to: schedule.route.to,
        //   date: schedule.date,
        //   departureTime: schedule.departureTime,
        //   busName: schedule.bussName,
        //   operatorName: schedule.operatorName,
        // },
        // seatNumbers: seatNumbers,
        // pricePerSeat: schedule.price,
        // totalSeats: seatNumbers.length,
        // yatrapointsUsed: yatrapointsToUse,
        // discountPercentage: Math.round(discountPercentage * 100) / 100,
        // discountAmount: roundedDiscountAmount,
        // finalAmount: roundedFinalAmount,
        // userYatraPoints: userYatraPoints,
        // remainingPoints: userYatraPoints - yatrapointsToUse,
      },
    });
  } catch (error) {
    console.error("Validate YatraPoints Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  createTicket,
  createSeats,
  updateTicket,
  deleteTicket,
  getTicketById,
  searchTickets,
  bookTicket,
  getSeatsById,
  getMyTicketHistory,
  validateYatraPoints,
  getMyYatraHistory,
  cancelTicket,
  searchTrips
};
