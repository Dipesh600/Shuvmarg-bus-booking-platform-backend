"use strict";

function createRevisionActivationService({ Fleet, Schedule, Revision, Version, tripRebase }) {
  async function applyDueRevisions(now = new Date()) {
    const due = await Revision.find({
      status: "SCHEDULED",
      effectiveAt: { $lte: now },
    }).lean();
    let applied = 0;
    for (const revision of due) {
      const version = await Version.findById(revision.toVersionId).lean();
      if (!version) continue;
      const fleet = await Fleet.findById(revision.fleetId).lean();
      if (!fleet) continue;
      await tripRebase.applyDue(revision.fleetId, version, now);
      const alreadyCurrent = String(fleet.seatLayoutVersionId) === String(version._id);
      if (!alreadyCurrent) {
        const fleetResult = await Fleet.updateOne(
          {
            _id: revision.fleetId,
            nextSeatLayoutVersionId: revision.toVersionId,
            seatLayoutEffectiveAt: { $lte: now },
          },
          {
            seatLayoutVersionId: version._id,
            seatConfig: version.seatConfig,
            totalSeats: version.totalSeats,
            nextSeatLayoutVersionId: null,
            seatLayoutEffectiveAt: null,
          }
        );
        if (!fleetResult.modifiedCount) continue;
      }
      await Schedule.updateMany(
        { busId: revision.fleetId, nextSeatLayoutVersionId: revision.toVersionId },
        {
          seatLayoutVersionId: version._id,
          nextSeatLayoutVersionId: null,
          seatLayoutEffectiveAt: null,
        }
      );
      await Revision.updateOne(
        { _id: revision._id, status: "SCHEDULED" },
        { status: "APPLIED" }
      );
      applied += 1;
    }
    return { scanned: due.length, applied };
  }

  return { applyDueRevisions };
}

module.exports = { createRevisionActivationService };
