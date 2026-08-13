"use strict";

const Trip = require("../../../models/tripModel");
const Assignment = require("../../../models/fleetSeatLayoutAssignmentModel");
const Revision = require("../../../models/seatLayoutRevisionModel");
const Snapshot = require("../../../models/tripSeatLayoutSnapshotModel");

function withSession(query, session) {
  return session ? query.session(session) : query;
}

const findTrip = (id, session) => withSession(Trip.findById(id).select("busId"), session).lean();
const findSnapshot = (tripId, session) => withSession(
  Snapshot.findOne({ tripId }).select("_id"), session
).lean();
const findAssignment = (fleetId, session) => withSession(Assignment.findOne({ fleetId }), session).lean();
const findRevision = (id, session) => withSession(Revision.findById(id), session).lean();
const createSnapshot = async (data, session) => {
  if (!session) return Snapshot.create(data);
  const [snapshot] = await Snapshot.create([data], { session });
  return snapshot;
};

module.exports = { findTrip, findSnapshot, findAssignment, findRevision, createSnapshot };
