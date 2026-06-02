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
const Stop = require("../../models/stopModel");
const { calculateRefund } = require("../../services/refundCalculatorService");
const RouteCorridor = require("../../models/routeCorridorModel");
const RouteVariant = require("../../models/routeVariantModel");
const RouteStop = require("../../models/routeStopModel");
const SeatHold = require("../../models/seatHoldModel.js");
const SeatTemplate = require("../../models/seatTemplateModel");
const { getPresignedUrl } = require("../../services/s3Service.js");


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
  return res.status(410).json({
    status: false,
    message: "Bus Schedule APIs are deprecated. Please use the Fleet Trip APIs (/api/public/searchTrips).",
  });
};



const searchTrips = async (req, res) => {
  try {
    const { from, to, date, shift } = req.body;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10); // max 50 per page
    const skip  = (page - 1) * limit;

    console.log("Search Query:", { from, to, date, shift, page, limit });

    // ── 1. Resolve stop names → stop IDs ──────────────────────────────────
    let legacyRouteIds = [];
    let variantIds     = [];
    let resolvedFromName = from?.trim() || "";
    let resolvedToName   = to?.trim()   || "";

    // stopTimingMap: variantId → { originMins, destMins }
    // Used later to calculate stop-specific departure/arrival times.
    // originMins/destMins = estimatedMinutesFromOrigin for the user's searched stops.
    const stopTimingMap = {};

    // Sets of stop ObjectId strings for the user's origin and destination.
    // Declared here so the response transformer (.map) can access them.
    let originStopIds = new Set();
    let destStopIds   = new Set();

    if (from && to) {
      const fromTrimmed = from.trim();
      const toTrimmed   = to.trim();

      // ── Legacy BusRoute lookup (both directions) ───────────────────────
      const [fwdRoutes, revRoutes] = await Promise.all([
        BusRoute.find({ from: new RegExp(`^${_esc(fromTrimmed)}$`, 'i'), to: new RegExp(`^${_esc(toTrimmed)}$`, 'i'), status: "ACTIVE" }),
        BusRoute.find({ from: new RegExp(`^${_esc(toTrimmed)}$`, 'i'), to: new RegExp(`^${_esc(fromTrimmed)}$`, 'i'), status: "ACTIVE" }),
      ]);
      legacyRouteIds = [...fwdRoutes, ...revRoutes].map(r => r._id);

      // ── Registry stop resolution ───────────────────────────────────────
      const nameOrCodeFilter = (val) => ({
        $or: [
          { name: new RegExp(`^${_esc(val)}$`, 'i') },
          { code: new RegExp(`^${_esc(val)}$`, 'i') },
        ],
        status: "ACTIVE",
      });

      const [originStops, destStops] = await Promise.all([
        Stop.find(nameOrCodeFilter(fromTrimmed)).select("_id name").lean(),
        Stop.find(nameOrCodeFilter(toTrimmed)).select("_id name").lean(),
      ]);

      if (originStops.length > 0) resolvedFromName = originStops[0].name;
      if (destStops.length   > 0) resolvedToName   = destStops[0].name;

      // Populate Sets used by the response transformer for timingConfig matching
      originStopIds = new Set(originStops.map(s => s._id.toString()));
      destStopIds   = new Set(destStops.map(s => s._id.toString()));

      if (originStops.length > 0 && destStops.length > 0) {
        const originIds = originStops.map(s => s._id);
        const destIds   = destStops.map(s => s._id);

        // ── Strategy A: Direct corridor (A→B or B→A) ──────────────────
        const [fwdCorridors, revCorridors] = await Promise.all([
          RouteCorridor.find({ originId: { $in: originIds }, destinationId: { $in: destIds }, status: "ACTIVE" }).lean(),
          RouteCorridor.find({ originId: { $in: destIds },  destinationId: { $in: originIds }, status: "ACTIVE" }).lean(),
        ]);

        const [fwdVariants, revVariants] = await Promise.all([
          fwdCorridors.length > 0
            ? RouteVariant.find({ corridorId: { $in: fwdCorridors.map(c => c._id) }, direction: "FORWARD", status: "ACTIVE" }).lean()
            : Promise.resolve([]),
          revCorridors.length > 0
            ? RouteVariant.find({ corridorId: { $in: revCorridors.map(c => c._id) }, direction: "RETURN",  status: "ACTIVE" }).lean()
            : Promise.resolve([]),
        ]);

        variantIds = [...fwdVariants, ...revVariants].map(v => v._id);

        // ── RouteStop fetch (always runs — used for timing AND journey validation) ───
        const [originRouteStops, destRouteStops] = await Promise.all([
          RouteStop.find({ stopId: { $in: originIds } }).select("variantId sequence estimatedMinutesFromOrigin isMajor").lean(),
          RouteStop.find({ stopId: { $in: destIds   } }).select("variantId sequence estimatedMinutesFromOrigin isMajor").lean(),
        ]);

        // Group dest stops by variantId for O(1) lookup
        const destByVariant = {};
        for (const ds of destRouteStops) {
          const vid = ds.variantId.toString();
          if (!destByVariant[vid] || ds.sequence < destByVariant[vid].sequence) {
            destByVariant[vid] = ds;
          }
        }

        // ── Build stopTimingMap + validate each variant against 3 gates ─────────
        //
        // GATE 1 — isMajor:          Both stops must be major stops on this variant.
        //   Minor junctions (rest stops, passing points) are not bookable.
        //   This matches how redBus/FlixBus define "bookable stops".
        //
        // GATE 2 — Minimum Journey:  Travel time between stops must be ≥
        //   operatorRouteConfig.minimumJourneyMinutes (default: 60).
        //   Prevents 10km "seat-blocker" bookings on long-haul buses.
        //   Source: RouteStop.estimatedMinutesFromOrigin (proxy for distance).
        //   NOTE: once timingConfig is fully populated, we can use actual times.
        //
        // GATE 3 — stopBehavior:     Origin must allow BOARDING; Destination must
        //   allow DROPPING. REST_STOP entries can never be passenger stops.
        //   Source: OperatorRouteConfig.timingConfig[].stopBehavior.
        //
        // Platform default minimum: 60 mins. Operator can override per config.
        const PLATFORM_DEFAULT_MIN_JOURNEY_MINS = 60;

        const rejectedVariants = new Set(); // variants that fail any gate

        for (const os of originRouteStops) {
          const vid = os.variantId.toString();
          const dst = destByVariant[vid];
          if (!dst || dst.sequence <= os.sequence) continue;

          // ─ GATE 1: Both stops must be major ──────────────────────────────
          if (!os.isMajor || !dst.isMajor) {
            rejectedVariants.add(vid);
            continue;
          }

          // ─ GATE 2: Minimum journey time ───────────────────────────────────
          // We use estimatedMinutesFromOrigin as the time proxy.
          // Actual operator timing (from timingConfig) will be used at booking time.
          const journeyMins = (dst.estimatedMinutesFromOrigin || 0) - (os.estimatedMinutesFromOrigin || 0);
          // minimumJourneyMinutes will be read from operatorConfig in the response transform.
          // At search time, enforce the platform default conservatively.
          if (journeyMins > 0 && journeyMins < PLATFORM_DEFAULT_MIN_JOURNEY_MINS) {
            rejectedVariants.add(vid);
            continue;
          }

          // ─ Passed all platform-level gates → record timing data ───────────
          stopTimingMap[vid] = {
            originMins: os.estimatedMinutesFromOrigin || 0,
            destMins:   dst.estimatedMinutesFromOrigin || 0,
          };
          // If Strategy A found no direct corridor variants, this is intermediate
          if (variantIds.length === 0) variantIds.push(os.variantId);
        }

        // Remove rejected variants from the candidate set
        variantIds = variantIds.filter(vid => !rejectedVariants.has(vid.toString()));

        // Fill stopTimingMap for Strategy A direct-corridor variants that passed
        if (variantIds.length > 0) {
          for (const v of [...fwdVariants, ...revVariants]) {
            const vid = v._id.toString();
            if (!stopTimingMap[vid] && !rejectedVariants.has(vid)) {
              const destRouteStop = destByVariant[vid];
              stopTimingMap[vid] = {
                originMins: 0,
                destMins:   destRouteStop?.estimatedMinutesFromOrigin || 0,
              };
            }
          }
        }
      }

      if (legacyRouteIds.length === 0 && variantIds.length === 0) {
        return res.status(200).json({
          success: true,
          message: "No routes found for the selected locations.",
          results: 0, total: 0, page: 1, totalPages: 0, data: [],
        });
      }
    }

    // 2. Build the trip query
    const tripQuery = {
      isActive: true,
      status: "scheduled",
      busId: { $ne: null },  // <<< GUARD: exclude trips with no fleet
      bookingClosesAt: { $gt: new Date() }, // <<< GUARD: Only trips that haven't closed booking
    };

    if (legacyRouteIds.length > 0 || variantIds.length > 0) {
      tripQuery.$or = [];
      if (legacyRouteIds.length > 0) tripQuery.$or.push({ routeId: { $in: legacyRouteIds } });
      if (variantIds.length > 0) tripQuery.$or.push({ variantId: { $in: variantIds } });
    }

    // Date filter — accepts both ISO string and Date
    if (date && date.trim() !== "") {
      const startOfDay = new Date(date.trim());
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(date.trim());
      endOfDay.setUTCHours(23, 59, 59, 999);
      tripQuery.tripDate = { $gte: startOfDay, $lte: endOfDay };
    }

    // Shift filter
    if (shift) {
      if (Array.isArray(shift)) {
        tripQuery.shift = { $in: shift };
      } else if (shift.toLowerCase() !== "both" && shift.trim() !== "") {
        tripQuery.shift = shift.trim().toLowerCase();
      }
    }

    // 3. Get total count for pagination metadata
    const total = await Trip.countDocuments(tripQuery);

    // 4. Fetch trips with FULL populate + pagination
    const trips = await Trip.find(tripQuery, "-createdAt -updatedAt -__v -isAutoGenerated -templateId -returnTripLinked -recurrence -daysOfWeek -autoGenerateUntil")
      .sort({ tripDate: 1, departureTime: 1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "busId",
        select: "busName busNumber busType vehicleType totalSeats seatLayout fleetImages averageRating totalReviews amenitiesId boardingPointId",
        populate: [
          { path: "amenitiesId",     select: "amenities -_id" },
          { path: "boardingPointId", select: "boardingPoints droppingPoints -_id" }
        ]
      })
      .populate({
        path: "variantId",
        select: "name direction",
        populate: {
          path: "corridorId",
          select: "distanceKm durationMinutes",
          populate: [
            { path: "originId",      select: "name code" },
            { path: "destinationId", select: "name code" }
          ]
        }
      })
      .populate("routeId", "routeName from to distance duration distanceKm durationMinutes basePrice")
      // Operator route config carries per-stop committed times.
      // Chain: Trip.scheduleId → Schedule.operatorRouteConfigId → OperatorRouteConfig
      .populate({
        path: "scheduleId",
        select: "operatorRouteConfigId",
        populate: {
          path: "operatorRouteConfigId",
          select: "timingConfig returnTimingConfig",
        }
      })
      .lean();

    // 5. Batch-query seat availability (1 DB call, not N+1)
    const tripIds = trips.map(t => t._id);
    const seatDocs = await Seat.find({ tripId: { $in: tripIds } }).lean();
    const seatAvailabilityMap = {};
    for (const doc of seatDocs) {
      const allSeats = [...(doc.seata || []), ...(doc.seatb || []), ...(doc.seatc || [])];
      seatAvailabilityMap[doc.tripId.toString()] = allSeats.filter(s => !s.booked).length;
    }

    // 6. Transform response — flatten and enrich
    // We use Promise.all here because getPresignedUrl is async and we have a list of trips.
    const formattedTrips = await Promise.all(trips
      .filter(trip => trip.busId != null)  // Extra null guard after populate
      .map(async trip => {
        let amenities = [];
        if (trip.busId?.amenitiesId?.amenities) {
          amenities = trip.busId.amenitiesId.amenities.map(a => a.name);
        }

        let boardingPoints = [];
        let droppingPoints = [];
        if (trip.busId?.boardingPointId) {
          boardingPoints = trip.busId.boardingPointId.boardingPoints || [];
          droppingPoints = trip.busId.boardingPointId.droppingPoints || [];
        }

        const effectivePrice = (trip.tripFare !== null && trip.tripFare !== undefined)
          ? trip.tripFare
          : (trip.routeId?.basePrice ?? 0);

        // Convert S3 keys to presigned URLs for the frontend
        const rawImages = trip.busId.fleetImages || [];
        const presignedImages = await Promise.all(
          rawImages.map(key => getPresignedUrl(key))
        );

        const busDetail = {
          _id: trip.busId._id,
          busName: trip.busId.busName,
          busNumber: trip.busId.busNumber,
          busType: trip.busId.busType,
          vehicleType: trip.busId.vehicleType,
          totalSeats: trip.busId.totalSeats,
          seatLayout: trip.busId.seatLayout,
          fleetImages: presignedImages.filter(Boolean),
          averageRating: trip.busId.averageRating || 0,
          totalReviews: trip.busId.totalReviews || 0,
          amenities,
          boardingPoints,
          droppingPoints,
        };


        let routeDetail = null;
        if (trip.routeId) {
          routeDetail = {
            _id: trip.routeId._id,
            routeName: trip.routeId.routeName,
            from: trip.routeId.from,
            to: trip.routeId.to,
            distance: trip.routeId.distance,
            duration: trip.routeId.duration,
            distanceKm: trip.routeId.distanceKm,
            durationMinutes: trip.routeId.durationMinutes,
          };
        } else if (trip.variantId) {
          // Use the user's resolved stop names — NOT the corridor endpoints.
          // This means a user searching Sindhuli→Bardibas sees exactly that,
          // not the full Kathmandu→Biratnagar corridor label.
          const corridorOrigin = trip.variantId.corridorId?.originId?.name;
          const corridorDest   = trip.variantId.corridorId?.destinationId?.name;
          const isReturnVariant = trip.variantId.direction === "RETURN";

          // For a RETURN variant the corridor's origin/dest are flipped relative
          // to travel direction — swap them so the label reads correctly.
          let displayFrom = isReturnVariant ? (corridorDest || trip.toStopName)   : (corridorOrigin || trip.fromStopName);
          let displayTo   = isReturnVariant ? (corridorOrigin || trip.fromStopName) : (corridorDest   || trip.toStopName);

          // If the user searched an intermediate stop, prefer their search terms
          // as the display labels (more useful than the full corridor name).
          if (resolvedFromName) displayFrom = resolvedFromName;
          if (resolvedToName)   displayTo   = resolvedToName;

          routeDetail = {
            _id: trip.variantId._id,
            routeName: trip.variantId.name || `${displayFrom} - ${displayTo}`,
            from: displayFrom,
            to:   displayTo,
            distance: null,
            duration: null,
            distanceKm:      trip.variantId.corridorId?.distanceKm      || 0,
            durationMinutes: trip.variantId.corridorId?.durationMinutes || 0,
          };
        }

        // Seats: 0 if no seat document exists (NOT totalSeats — prevents phantom booking)
        const availableSeats = seatAvailabilityMap[trip._id.toString()] ?? 0;

        // ── Operator stop-time resolution ────────────────────────────────────
        // Each operator commits to exact per-stop arrival/departure times when
        // they configure their route service (OperatorRouteConfig.timingConfig).
        // Chain:
        //   Trip.scheduleId → Schedule.operatorRouteConfigId → OperatorRouteConfig
        //     .timingConfig[]           (FORWARD direction: A→B)
        //     .returnTimingConfig[]     (RETURN  direction: B→A)
        //
        // We resolve user's from-stop → estimatedDeparture at that stop
        // We resolve user's to-stop   → estimatedArrival  at that stop
        // dayOffset = 0 (same day), 1 (next day) for overnight services
        const operatorConfig = trip.scheduleId?.operatorRouteConfigId;
        const isReturnVariant = trip.variantId?.direction === "RETURN";
        const timingArray = operatorConfig
          ? (isReturnVariant
              ? (operatorConfig.returnTimingConfig || operatorConfig.timingConfig)
              : operatorConfig.timingConfig)
          : [];

        // Resolve the user's searched stop IDs against the timing array.
        // We use string comparison because after .lean() IDs are ObjectId objects.
        let resolvedDepartureTime = trip.departureTime; // fallback: terminal departure
        let resolvedArrivalTime   = trip.arrivalTime;   // fallback: terminal arrival
        let failsStopBehaviorGate = false;

        if (timingArray.length > 0) {
          const fromEntry = timingArray.find(tc => originStopIds.has(tc.stopId?.toString()));
          const toEntry   = timingArray.find(tc => destStopIds.has(tc.stopId?.toString()));

          // ── Time resolution (strict non-empty check) ──────────────────────
          // Operators sometimes fill estimatedArrival but leave estimatedDeparture
          // blank, or vice versa. We must check for non-empty strings explicitly —
          // NOT just truthiness — because "" is falsy but means "not entered".
          //
          // Priority for departure display:
          //   1. fromEntry.estimatedDeparture  (what time bus leaves this stop)
          //   2. fromEntry.estimatedArrival    (when bus arrives — better than terminal time)
          //   3. trip.departureTime            (raw terminal departure — last resort)
          //
          // Priority for arrival display:
          //   1. toEntry.estimatedArrival      (what time bus arrives at dest stop)
          //   2. toEntry.estimatedDeparture    (when bus departs — better than terminal time)
          //   3. trip.arrivalTime              (raw terminal arrival — last resort)

          if (fromEntry) {
            const dep = (fromEntry.estimatedDeparture || "").trim();
            const arr = (fromEntry.estimatedArrival   || "").trim();
            if (dep) resolvedDepartureTime = dep;
            else if (arr) resolvedDepartureTime = arr;
            // else: stays as trip.departureTime
          }

          if (toEntry) {
            const arr = (toEntry.estimatedArrival   || "").trim();
            const dep = (toEntry.estimatedDeparture || "").trim();
            if (arr) resolvedArrivalTime = arr;
            else if (dep) resolvedArrivalTime = dep;
            // else: stays as trip.arrivalTime
          }

          // ── GATE 3: stopBehavior ──────────────────────────────────────────
          // Origin must allow BOARDING. Destination must allow DROPPING.
          // REST_STOP or reversed behaviors silently reject this trip card.
          if (fromEntry && !["BOARDING_ONLY", "BOTH"].includes(fromEntry.stopBehavior)) failsStopBehaviorGate = true;
          if (toEntry   && !["DROPPING_ONLY", "BOTH"].includes(toEntry.stopBehavior))   failsStopBehaviorGate = true;

          // ── Operator-level minimum journey enforcement ────────────────────
          // Operator can configure a stricter min than the 60-min platform default.
          // We use actual HH:MM times here (more accurate than estimatedMinutesFromOrigin).
          const operatorMin = operatorConfig?.minimumJourneyMinutes ?? 60;
          if (operatorMin > 0 && fromEntry?.estimatedDeparture && toEntry?.estimatedArrival) {
            const depMins  = _timeToMins(fromEntry.estimatedDeparture);
            const arrMins  = _timeToMins(toEntry.estimatedArrival);
            const fromDay  = fromEntry.dayOffset || 0;
            const toDay    = toEntry.dayOffset   || 0;
            let actualMins = (arrMins + toDay * 1440) - (depMins + fromDay * 1440);
            // Overnight route: departure 17:00, arrival 05:15 → actualMins is negative when dayOffset=0.
            // In that case, the bus clearly crosses midnight → add 1 day so the check works correctly.
            if (actualMins < 0) actualMins += 1440;
            if (actualMins < operatorMin) failsStopBehaviorGate = true;
          }
        }

        // Return null for gate-failed trips — filtered out after Promise.all
        if (failsStopBehaviorGate) return null;


        return {
          _id: trip._id,
          tripId: trip.tripId,
          tripDate: trip.tripDate,
          departureTime: resolvedDepartureTime,
          arrivalTime:   resolvedArrivalTime,
          tripFare: effectivePrice,
          shift: trip.shift,
          status: trip.status,
          busDetail,
          routeDetail,
          availableSeats,
        };
      }));

    // Remove null entries — trips rejected by Gate 3 (stopBehavior / operator minimum)
    const validTrips = formattedTrips.filter(Boolean);

    return res.status(200).json({
      success: true,
      message: validTrips.length === 0 ? "No trips found" : "Trips found successfully",
      results: validTrips.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: validTrips
    });

  } catch (error) {
    console.error("searchTrips error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
};

const createSeats = async (req, res) => {
  return res.status(410).json({
    status: false,
    message: "Manual seat creation is deprecated. Seats are now automatically created from templates when a Trip is generated.",
  });
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

    const seats = await Seat.findOne({ tripId: tripId }).lean();
    if (!seats) {
      return res.status(404).json({
        status: false,
        message: "Seats Not Found!",
      });
    }

    let seatConfig = null;
    const trip = await Trip.findById(tripId).populate("seatTemplateId busId");
    if (trip) {
      if (trip.seatTemplateId && trip.seatTemplateId.seatConfig) {
        seatConfig = trip.seatTemplateId.seatConfig;
      } else if (trip.busId && trip.busId.seatConfig) {
        seatConfig = trip.busId.seatConfig;
      }
    }

    // [NEW] Soft Locking: Mask actively held seats as booked
    const currentUserId = req.userInfo ? req.userInfo.id : null;
    const activeHolds = await SeatHold.find({
      tripId: tripId,
      expiresAt: { $gt: new Date() },
      ...(currentUserId ? { userId: { $ne: currentUserId } } : {}) // Don't mask holds belonging to the requesting user
    });

    if (activeHolds.length > 0) {
      let heldSeatsSet = new Set();
      activeHolds.forEach(hold => hold.seatNumbers.forEach(s => heldSeatsSet.add(s.toLowerCase())));

      // Override booked status for held seats
      const maskSeats = (seatArray) => {
        if (!seatArray) return;
        seatArray.forEach(seat => {
          if (!seat.booked && heldSeatsSet.has(seat.seatNo.toLowerCase())) {
            seat.booked = true; // Mask as booked for the UI
            seat.blockedFor = "reserved"; // Optional flag so UI could style it differently if needed
          }
        });
      };

      maskSeats(seats.seata);
      maskSeats(seats.seatb);
      maskSeats(seats.seatc);
    }

    return res.status(200).json({
      status: true,
      message: "Successfully fetched seats!",
      data: {
        ...seats,
        seatConfig: seatConfig
      },
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
      fromStopId,  // optional — sent by app when user searched via stop registry
      toStopId,    // optional — sent by app when user searched via stop registry
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

    // Fetch Trip details
    const trip = await Trip.findById(effectiveTripId)
      .populate("routeId")
      .populate({
        path: "scheduleId",
        select: "operatorRouteConfigId",
        populate: {
          path: "operatorRouteConfigId",
          select: "timingConfig returnTimingConfig minimumJourneyMinutes",
        }
      });
    if (!trip) {
      return res.status(404).json({ status: false, message: "Trip not found!" });
    }

    // ── Defense-in-depth: Minimum Journey Validation ─────────────────────────
    // This is the SECOND enforcement layer (search-level gates are first).
    // Runs only when the client supplies fromStopId and toStopId.
    // Protects against direct API calls that skip the search UI.
    if (fromStopId && toStopId) {
      const operatorCfg    = trip.scheduleId?.operatorRouteConfigId;
      const isReturn        = trip.variantId?.direction === "RETURN";
      const bookingTimingArr = operatorCfg
        ? (isReturn ? (operatorCfg.returnTimingConfig || operatorCfg.timingConfig) : operatorCfg.timingConfig)
        : [];

      if (bookingTimingArr.length > 0) {
        const fromTc = bookingTimingArr.find(tc => tc.stopId?.toString() === fromStopId);
        const toTc   = bookingTimingArr.find(tc => tc.stopId?.toString() === toStopId);

        // Gate 3-B: stopBehavior
        if (fromTc && !["BOARDING_ONLY", "BOTH"].includes(fromTc.stopBehavior)) {
          return res.status(400).json({ status: false, message: "Boarding is not permitted at the selected origin stop." });
        }
        if (toTc && !["DROPPING_ONLY", "BOTH"].includes(toTc.stopBehavior)) {
          return res.status(400).json({ status: false, message: "Dropping is not permitted at the selected destination stop." });
        }

        // Gate 2-B: Minimum journey minutes
        const minMins = operatorCfg?.minimumJourneyMinutes ?? 60;
        if (minMins > 0 && fromTc?.estimatedDeparture && toTc?.estimatedArrival) {
          const depM   = _timeToMins(fromTc.estimatedDeparture);
          const arrM   = _timeToMins(toTc.estimatedArrival);
          const fDay   = fromTc.dayOffset || 0;
          const tDay   = toTc.dayOffset   || 0;
          const travelMins = (arrM + tDay * 1440) - (depM + fDay * 1440);
          if (travelMins < minMins) {
            return res.status(400).json({
              status: false,
              message: `This service requires a minimum journey of ${minMins} minutes. Please select stops that are further apart.`,
            });
          }
        }
      }
    }

    // Determine price: Use tripFare if not null, otherwise use route basePrice
    const tripPrice = trip.tripFare !== null ? trip.tripFare : trip.routeId?.basePrice ?? 0;
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
      let seatKey = null;
      if (seatDoc.seata.some((s) => s.seatNo.toLowerCase() === seat.toLowerCase())) {
        seatKey = "seata";
      } else if (seatDoc.seatb.some((s) => s.seatNo.toLowerCase() === seat.toLowerCase())) {
        seatKey = "seatb";
      } else if (seatDoc.seatc.some((s) => s.seatNo.toLowerCase() === seat.toLowerCase())) {
        seatKey = "seatc";
      }
      if (seatKey) {
        const seatObj = seatDoc[seatKey].find((s) => s.seatNo.toLowerCase() === seat.toLowerCase());
        if (seatObj) {
          seatObj.booked = true;
          seatObj.bookedBy = userId;
          seatObj.bookedAt = new Date();
        }
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

    // Fetch the trip to get departure info for refund calculation
    const trip = await Trip.findById(booking.tripId);
    if (!trip) {
      return res.status(404).json({
        status: false,
        message: "Trip details not found.",
      });
    }

    // Calculate refund using the policy engine
    const estimate = await calculateRefund({
      totalAmount: booking.totalAmount || 0,
      tripDate: trip.tripDate,
      departureTime: trip.departureTime,
    });

    if (!estimate.eligible) {
      return res.status(400).json({
        status: false,
        message: estimate.reason,
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
      let seatKey = null;
      if (seatDoc.seata.some((s) => s.seatNo.toLowerCase() === seatNo.toLowerCase())) {
        seatKey = "seata";
      } else if (seatDoc.seatb.some((s) => s.seatNo.toLowerCase() === seatNo.toLowerCase())) {
        seatKey = "seatb";
      } else if (seatDoc.seatc.some((s) => s.seatNo.toLowerCase() === seatNo.toLowerCase())) {
        seatKey = "seatc";
      }
      if (seatKey) {
        const seatObj = seatDoc[seatKey]?.find((s) => s.seatNo.toLowerCase() === seatNo.toLowerCase());
        if (seatObj) {
          seatObj.booked = false;
          seatObj.bookedBy = null;
          seatObj.bookedAt = null;
        }
      }
    };

    booking.seats.forEach((s) => freeSeat(s.toLowerCase()));

    // Mark modified for nested arrays if needed
    seatDoc.markModified('seata');
    seatDoc.markModified('seatb');
    seatDoc.markModified('seatc');
    await seatDoc.save();

    // Claw back any cashback earned from this booking (Spec 2.5)
    const { clawbackCashback } = require("../../services/smLedgerService");
    try {
      const clawbackResult = await clawbackCashback(booking._id);
      if (clawbackResult.clawedBack > 0) {
        console.log(`Clawed back Rs. ${clawbackResult.clawedBack} cashback for cancelled booking ${booking._id}`);
      }
    } catch (cbErr) {
      console.error("Cashback clawback failed during cancellation:", cbErr);
      // We log but do not block the refund if clawback fails, though ideally it should be atomic.
    }

    // Create Refund record with policy-calculated amounts
    const refundMethodInput = req.body.refundMethod || "original";
    const isWalletRefund = refundMethodInput === "wallet";

    let refundStatus = "pending";
    let refundGateway = null;
    let remarks = null;
    let processedAt = null;
    let completedAt = null;

    if (isWalletRefund) {
      refundStatus = "completed";
      refundGateway = "yatra_balance";
      remarks = "Refunded instantly to Shuvmarg Money";
      processedAt = new Date();
      completedAt = new Date();

      // Process wallet credit instantly
      const { creditWallet } = require("../../services/walletService");
      try {
        await creditWallet({
          userId: userId,
          amount: estimate.refundAmount,
          purpose: "refund",
          referenceType: "refund",
          referenceId: booking._id,
          remarks: `Instant refund for cancelled ticket ${booking.ticketId}`,
        });
      } catch (walletErr) {
        console.error("Instant Yatra Balance credit failed:", walletErr);
        // Fall back to original gateway queue if wallet credit fails
        refundStatus = "pending";
        refundGateway = null;
        remarks = `Failed instant Yatra Balance refund: ${walletErr.message}. Queued for manual check.`;
        processedAt = null;
        completedAt = null;
      }
    }

    const refund = await Refund.create({
      userId: userId,
      bookingId: booking._id,
      originalAmount: estimate.refundAmount + estimate.cancellationCharge,
      cancellationCharge: estimate.cancellationCharge,
      refundAmount: estimate.refundAmount,
      status: refundStatus,
      requestedAt: new Date(),
      processedAt,
      completedAt,
      remarks,
      refundGateway,
      reason: cancelReason || "User cancelled",
    });

    // Update booking status and cancellation details
    booking.status = "cancelled";
    booking.cancellationReason = cancelReason || "User cancelled";
    booking.cancellationRequestedAt = new Date();
    booking.cancelledBy = "user";
    booking.refundId = refund._id;

    await booking.save();

    // Prepare and send notifications (local + push)
    try {
      const tripDetails = await Trip.findById(booking.tripId).populate("routeId");
      const routeInfo = tripDetails?.routeId
        ? `${tripDetails.routeId.from} to ${tripDetails.routeId.to}`
        : "Route information not available";

      await createLocalNotification(
        userId,
        "TICKET_CANCELLED",
        "Booking Cancelled",
        `Your booking (${booking.ticketId}) for ${routeInfo} has been cancelled. Refund of NPR ${estimate.refundAmount} is being processed.`,
        {
          tripId: booking.tripId,
          seats: booking.seats,
          ticketId: booking.ticketId,
          route: routeInfo,
          refundAmount: estimate.refundAmount,
        }
      );

      const userDevices = await UserDeviceInfo.find({ userId });
      const tokens = userDevices.map((device) => device.token).filter(Boolean);
      if (tokens.length > 0) {
        await notificationManager(
          tokens,
          "Booking Cancelled",
          `Your booking (${booking.ticketId}) for ${routeInfo} has been cancelled. Refund: NPR ${estimate.refundAmount}.`
        );
      }
    } catch (notifyErr) {
      console.error("Error sending cancellation notifications:", notifyErr);
    }

    return res.status(200).json({
      status: true,
      message: "Booking cancelled successfully",
      data: {
        ticketId: booking.ticketId,
        status: "cancelled",
        refundAmount: estimate.refundAmount,
        cancellationCharge: estimate.cancellationCharge,
        refundPercentage: estimate.refundPercentage,
        appliedPolicy: estimate.appliedPolicy?.name || "Default",
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

// Cancel Estimate — preview refund breakdown without executing cancellation
const cancelEstimate = async (req, res) => {
  try {
    const { ticketId } = req.body;
    const userId = req.userInfo.id;

    if (!ticketId) {
      return res.status(400).json({
        status: false,
        message: "ticketId is required",
      });
    }

    const booking = await Booking.findOne({ ticketId });
    if (!booking) {
      return res.status(404).json({
        status: false,
        message: "Booking not found",
      });
    }

    if (booking.userId.toString() !== userId) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to view this booking",
      });
    }

    if (booking.status !== "booked") {
      return res.status(400).json({
        status: false,
        message: `Cannot cancel a booking with status '${booking.status}'`,
      });
    }

    const trip = await Trip.findById(booking.tripId);
    if (!trip) {
      return res.status(404).json({
        status: false,
        message: "Trip details not found",
      });
    }

    const estimate = await calculateRefund({
      totalAmount: booking.totalAmount || 0,
      tripDate: trip.tripDate,
      departureTime: trip.departureTime,
    });

    return res.status(200).json({
      status: true,
      message: "Refund estimate calculated",
      data: {
        ticketId: booking.ticketId,
        ticketFare: booking.totalAmount,
        eligible: estimate.eligible,
        reason: estimate.reason,
        refundAmount: estimate.refundAmount,
        cancellationCharge: estimate.cancellationCharge,
        gatewayDeduction: estimate.gatewayDeduction,
        refundPercentage: estimate.refundPercentage,
        hoursBeforeDeparture: estimate.hoursBeforeDeparture,
        appliedPolicy: estimate.appliedPolicy,
      },
    });
  } catch (error) {
    console.error("Cancel Estimate Error:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to calculate refund estimate",
    });
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

    // Fetch refund records for all bookings (for cancelled tickets)
    const refunds = await Refund.find({
      bookingId: { $in: bookingIds },
    })
      .select({
        bookingId: 1,
        originalAmount: 1,
        cancellationCharge: 1,
        refundAmount: 1,
        status: 1,
        requestedAt: 1,
        processedAt: 1,
        completedAt: 1,
        reason: 1,
        remarks: 1,
        refundGateway: 1,
      })
      .lean();
    const refundByBookingId = new Map(
      refunds.map((r) => [String(r.bookingId), r])
    );

    const result = await Promise.all(bookings.map(async (booking) => {
      const transaction = transactionByBookingId.get(String(booking._id)) || null;
      const refund = refundByBookingId.get(String(booking._id)) || null;

      let trip = booking.tripId || null;

      if (trip && trip.busId) {
        const bus = trip.busId;
        const rawImages = bus?.fleetImages || [];
        const presignedImages = await Promise.all(
          rawImages.map((key) => getPresignedUrl(key))
        );

        trip.busId = {
          ...bus,
          fleetImages: presignedImages.filter(Boolean),
          amenitiesDetail: bus.amenitiesId || null,
          boardingPointDetail: bus.boardingPointId || null,
          amenitiesId: undefined,
          boardingPointId: undefined,
        };
      }

      if (trip) {
        // Build routeDetail — prefer populated routeId, fall back to denormalized fields
        const routeDetail = trip.routeId
          ? trip.routeId
          : {
              _id: trip.variantId || null,
              routeName: trip.directionLabel || `${trip.fromStopName || "?"} → ${trip.toStopName || "?"}`,
              from: trip.fromStopName || "N/A",
              to: trip.toStopName || "N/A",
            };

        trip = {
          ...trip,
          routeDetail,
          routeId: undefined,
        };
      }

      return {
        booking: {
          seats: booking.seats,
          totalAmount: booking.totalAmount,
          status: booking.status,
          refundStatus: refund?.status || booking.refundStatus || "",
          refundAmount: refund?.refundAmount || booking.refundAmount || 0,
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
        refund: refund
          ? {
            refundAmount: refund.refundAmount,
            cancellationCharge: refund.cancellationCharge,
            originalAmount: refund.originalAmount,
            status: refund.status,
            requestedAt: refund.requestedAt,
            processedAt: refund.processedAt,
            completedAt: refund.completedAt,
            reason: refund.reason,
            remarks: refund.remarks,
            refundGateway: refund.refundGateway,
          }
          : null,
      };
    }));

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

/**
 * Escape special regex characters in user-supplied strings.
 * Never pass raw user input directly into RegExp — this prevents ReDoS attacks.
 */
function _esc(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Add `offsetMins` minutes to a base "HH:MM" time string.
 * Handles midnight roll-over (e.g., 23:00 + 90 mins = 00:30).
 *
 * @param {string} baseTime  - "HH:MM" trip departure time
 * @param {number|undefined} offsetMins - minutes from origin to this stop
 * @returns {string} - adjusted "HH:MM" time, or baseTime if offset is null/undefined
 */
function _resolveStopTime(baseTime, offsetMins) {
  // No offset data → fall back to the raw trip time (legacy routes, terminal stops)
  if (offsetMins === null || offsetMins === undefined || !baseTime) return baseTime;
  if (offsetMins === 0) return baseTime;

  const [hours, minutes] = baseTime.split(":").map(Number);
  const totalMins = hours * 60 + minutes + offsetMins;
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Convert a time string to total minutes since midnight.
 * Handles BOTH formats found in the DB:
 *   "05:20 PM"  → 1040 mins  (12-hour AM/PM — written by admin portal)
 *   "17:20"     → 1040 mins  (24-hour — standard HH:MM)
 * Returns 0 for null/invalid inputs.
 */
function _timeToMins(time) {
  if (!time || typeof time !== "string") return 0;
  const t = time.trim().toUpperCase();

  // 12-hour format: "05:20 PM" / "12:00 AM"
  const match12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = parseInt(match12[2], 10);
    const period = match12[3];
    if (period === "AM") {
      if (h === 12) h = 0;       // 12:xx AM → 00:xx
    } else {
      if (h !== 12) h += 12;    // x:xx PM → (x+12):xx, but 12:xx PM stays 12
    }
    return h * 60 + m;
  }

  // 24-hour format: "17:20"
  const match24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return parseInt(match24[1], 10) * 60 + parseInt(match24[2], 10);
  }

  return 0; // unparseable — treated as midnight
}

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
  cancelEstimate,
  searchTrips
};
