"use strict";
const id = value => value?._id?.toString?.() || value?.toString?.() || null;
  const map = profile => ({
    _id: id(profile._id), brandId: profile.brandId?._id ? {
      _id: id(profile.brandId), brandName: profile.brandId.brandName,
    } : id(profile.brandId), ownerId: id(profile.ownerId), userId: id(profile.userId),
    fullName: profile.fullName, phone: profile.phone, notes: profile.notes || null,
    status: profile.status, accessStatus: profile.accessStatus,
    invitationDeliveryStatus: profile.invitationDeliveryStatus,
    invitedAt: profile.invitedAt || null, activatedAt: profile.activatedAt || null,
    invitationLastAttemptAt: profile.invitationLastAttemptAt || null,
    phoneVerified: Boolean(profile.userId?.phoneVerified), createdBy: profile.createdBy || "OPERATOR",
    removedAt: profile.removedAt || null, suspensionReason: profile.suspensionReason || null,
    createdAt: profile.createdAt, updatedAt: profile.updatedAt,
    statusHistory: (profile.statusHistory || []).map(entry => ({ from: entry.from, to: entry.to,
      actorId: id(entry.actorId), at: entry.at, reason: entry.reason || null })),
    assignedTrips: (profile.assignedTripIds || []).map(trip => ({
      _id: id(trip._id), tripId: trip.tripId, tripDate: trip.tripDate,
      departureTime: trip.departureTime, arrivalTime: trip.arrivalTime, status: trip.status,
      bus: trip.busId ? { _id: id(trip.busId), busName: trip.busId.busName, busNumber: trip.busId.busNumber } : null,
      route: trip.routeId ? { _id: id(trip.routeId), routeName: trip.routeId.routeName,
        fromCity: trip.routeId.fromCity, toCity: trip.routeId.toCity } : null,
    })),
  });

module.exports = { id, map };
