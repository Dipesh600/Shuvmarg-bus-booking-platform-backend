const Route = require("../models/busRouteModel.js");
const BusOwner = require("../models/busOwnerModel.js");

const isBusOwnerVerified = async (userId) => {
    const busOwner = await BusOwner.findOne({ user: userId });
    return busOwner && busOwner.verificationStatus === "approved";
};

const createBusRoute = async (ownerId, data) => {
    const { routeName, from, to, distance, duration, basePrice, isRoundTrip, returnRouteId } = data;

    if (!routeName || !from || !to || !basePrice) {
        throw new Error("Please provide routeName, from, to, and basePrice.");
    }

    const isVerified = await isBusOwnerVerified(ownerId);
    if (!isVerified) {
        throw new Error("Owner must be approved to create routes.");
    }

    return await Route.create({
        routeName,
        from,
        to,
        distance,
        duration,
        basePrice,
        isRoundTrip,
        returnRouteId,
        ownerId,
    });
};

const getBusRoutesByOwnerId = async (ownerId) => {
    return await Route.find({ ownerId }).sort({ createdAt: -1 }).lean();
};

const getBusRouteById = async (routeId, ownerId = null) => {
    const query = { _id: routeId };
    if (ownerId) query.ownerId = ownerId;

    const route = await Route.findOne(query);
    if (!route) {
        throw new Error("Route not found.");
    }
    return route;
};

const updateBusRoute = async (routeId, ownerId = null, data) => {
    const { routeName, from, to, distance, duration, basePrice, status, isRoundTrip } = data;

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
            from: from !== undefined ? from : existingRoute.from,
            to: to !== undefined ? to : existingRoute.to,
            distance: distance !== undefined ? distance : existingRoute.distance,
            duration: duration !== undefined ? duration : existingRoute.duration,
            basePrice: basePrice !== undefined ? basePrice : existingRoute.basePrice,
            status: status !== undefined ? status : existingRoute.status,
            isRoundTrip: isRoundTrip !== undefined ? isRoundTrip : existingRoute.isRoundTrip,
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
    getBusRouteById,
    updateBusRoute,
    deleteBusRoute,
};
