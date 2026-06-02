const Route = require("../models/busRouteModel.js");
const BusOwner = require("../models/busOwnerModel.js");

const isBusOwnerVerified = async (userId) => {
    const busOwner = await BusOwner.findOne({ user: userId });
    return busOwner && busOwner.verificationStatus === "approved";
};

const createBusRoute = async (ownerId, data) => {
    const { 
        routeName, from, to, distanceKm, durationMinutes, type, stoppages, via, 
        autoGenerateReturn = false 
    } = data;

    if (!routeName || !from || !to) {
        throw new Error("Please provide routeName, from, and to.");
    }

    // 1. Create the Forward Route
    const forwardRoute = await Route.create({
        routeName,
        via,
        from,
        to,
        distanceKm,
        durationMinutes,
        ownerId: type === "GLOBAL" ? null : ownerId,
        type: type || (ownerId ? "CUSTOM" : "GLOBAL"),
        stoppages: stoppages || []
    });

    // 2. If requested, automatically create the reciprocal Return Route
    if (autoGenerateReturn) {
        const returnStoppages = [...(stoppages || [])].reverse().map(stop => {
            // Recalculate distance from source for the return trip
            // This is a simplified logic: returnDistance = TotalDistance - currentDistanceFromSource
            return {
                ...stop,
                distanceFromSource: distanceKm - stop.distanceFromSource
            };
        });

        const returnRoute = await Route.create({
            routeName: `${routeName} (Return)`,
            via,
            from: to,
            to: from,
            distanceKm,
            durationMinutes,
            ownerId: type === "GLOBAL" ? null : ownerId,
            type: type || (ownerId ? "CUSTOM" : "GLOBAL"),
            stoppages: returnStoppages,
            returnRouteId: forwardRoute._id
        });

        // Link the forward route back to its return route
        forwardRoute.returnRouteId = returnRoute._id;
        await forwardRoute.save();

        return { forward: forwardRoute, return: returnRoute };
    }

    return forwardRoute;
};

const getAllGlobalRoutes = async () => {
    return await Route.find({ type: "GLOBAL", status: "ACTIVE" })
        .populate("stoppages.linkedPoints")
        .sort({ routeName: 1 })
        .lean();
};

const getBusRoutesByOwnerId = async (ownerId) => {
    return await Route.find({ 
        $or: [
            { type: "GLOBAL", status: "ACTIVE" },
            { ownerId: ownerId }
        ] 
    })
    .populate("stoppages.linkedPoints")
    .sort({ type: 1, routeName: 1 })
    .lean();
};

const getBusRouteById = async (routeId, ownerId = null) => {
    const query = { _id: routeId };
    if (ownerId) query.ownerId = ownerId;

    const route = await Route.findOne(query).populate("stoppages.linkedPoints");
    if (!route) {
        throw new Error("Route not found.");
    }
    return route;
};

const updateBusRoute = async (routeId, ownerId = null, data) => {
    const { routeName, from, to, distanceKm, durationMinutes, status, stoppages, via } = data;

    const query = { _id: routeId };
    if (ownerId) query.ownerId = ownerId;

    const existingRoute = await Route.findOne(query);
    if (!existingRoute) {
        throw new Error("Route not found or unauthorized.");
    }

    return await Route.findByIdAndUpdate(
        routeId,
        {
            routeName: routeName !== undefined ? routeName : existingRoute.routeName,
            via: via !== undefined ? via : existingRoute.via,
            from: from !== undefined ? from : existingRoute.from,
            to: to !== undefined ? to : existingRoute.to,
            distanceKm: distanceKm !== undefined ? distanceKm : existingRoute.distanceKm,
            durationMinutes: durationMinutes !== undefined ? durationMinutes : existingRoute.durationMinutes,
            status: status !== undefined ? status : existingRoute.status,
            stoppages: stoppages !== undefined ? stoppages : existingRoute.stoppages,
        },
        { new: true, runValidators: true }
    );
};

const deleteBusRoute = async (routeId, ownerId = null) => {
    const query = { _id: routeId };
    if (ownerId) query.ownerId = ownerId;

    const deletedRoute = await Route.findOneAndDelete(query);
    if (!deletedRoute) {
        throw new Error("Route not found or unauthorized.");
    }
    return deletedRoute;
};

module.exports = {
    isBusOwnerVerified,
    createBusRoute,
    getBusRoutesByOwnerId,
    getAllGlobalRoutes,
    getBusRouteById,
    updateBusRoute,
    deleteBusRoute,
};
