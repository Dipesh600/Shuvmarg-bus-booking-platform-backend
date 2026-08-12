"use strict";

const { ApiError } = require("../../contracts");
const { classifyRevision, validateEffectiveAt } = require("./seat-layout-revision.policy");
const { createRevisionContext } = require("./seat-layout-revision.context");

function createSeatLayoutRevisionService(deps) {
  const {
    Fleet, Schedule, Revision, Version, versions, conflicts, tripRebase,
    clock = () => new Date(),
  } = deps;
  const context = createRevisionContext({ Fleet, Revision, Version });

  async function applyNow(fleet, current, proposedSeatConfig, diff, reason) {
    const version = await versions.createVersion(current.templateId, proposedSeatConfig, {
      sourceVersionId: current._id,
      changeNote: reason || "Addition-only fleet layout revision",
      publishTemplate: false,
      reuseExisting: true,
    });
    const effectiveAt = clock();
    const tripIds = await conflicts.affectedTrips(fleet._id, effectiveAt);
    await tripRebase.stage(tripIds, version, effectiveAt);
    await tripRebase.applyDue(fleet._id, version, effectiveAt);
    await Fleet.updateOne({ _id: fleet._id }, {
      seatLayoutVersionId: version._id,
      seatConfig: version.seatConfig,
      totalSeats: version.totalSeats,
      nextSeatLayoutVersionId: null,
      seatLayoutEffectiveAt: null,
    });
    await Schedule.updateMany(
      { busId: fleet._id, status: { $in: ["DRAFT", "ACTIVE", "SUSPENDED"] } },
      {
        seatLayoutVersionId: version._id,
        nextSeatLayoutVersionId: null,
        seatLayoutEffectiveAt: null,
      }
    );
    return Revision.create({
      fleetId: fleet._id, ownerId: fleet.ownerId,
      fromVersionId: current._id, toVersionId: version._id,
      proposedSeatConfig, ...diff, status: "APPLIED", reason,
      effectiveAt, reviewedAt: effectiveAt,
    });
  }

  async function requestRevision({ fleetId, ownerId, proposedSeatConfig, effectiveAt, reason }) {
    await context.assertNoOpen(fleetId);
    const { fleet, current } = await context.load(fleetId, ownerId);
    const diff = classifyRevision(current.seatConfig, proposedSeatConfig, effectiveAt, clock());
    if (diff.classification === "ADDITION_ONLY") {
      return applyNow(fleet, current, proposedSeatConfig, diff, reason);
    }
    await conflicts.assertSeatsClear(fleet._id, diff.effectiveAt, diff.removedSeatLabels);
    return Revision.create({
      fleetId: fleet._id, ownerId: fleet.ownerId, fromVersionId: current._id,
      proposedSeatConfig, ...diff, status: "PENDING_REVIEW", reason,
    });
  }

  async function decideRevision({ revisionId, decision, adminId, rejectionReason, effectiveAt }) {
    const revision = await Revision.findById(revisionId);
    if (!revision || !["PENDING_REVIEW", "APPLYING"].includes(revision.status)) {
      throw new ApiError("FLEET_LAYOUT_CHANGE_BLOCKED", {
        details: { reason: "Only a pending seat layout revision can be reviewed." },
      });
    }
    if (decision === "REJECT" && revision.status === "PENDING_REVIEW") {
      if (!String(rejectionReason || "").trim()) {
        throw new ApiError("FLEET_LAYOUT_INVALID", { details: { reason: "Rejection reason is required." } });
      }
      revision.status = "REJECTED";
      revision.rejectionReason = String(rejectionReason).trim();
      revision.reviewedAt = clock();
      revision.reviewedBy = adminId;
      return revision.save();
    }
    if (decision !== "APPROVE") throw new ApiError("FLEET_LAYOUT_INVALID");
    const finalEffectiveAt = validateEffectiveAt(effectiveAt || revision.effectiveAt, clock());
    const { fleet, current } = await context.load(revision.fleetId);
    if (current._id.toString() !== revision.fromVersionId.toString()) {
      throw new ApiError("FLEET_LAYOUT_CHANGE_BLOCKED", {
        details: { reason: "Fleet layout changed after this revision was requested." },
      });
    }
    const check = await conflicts.assertSeatsClear(fleet._id, finalEffectiveAt, revision.removedSeatLabels);
    revision.effectiveAt = finalEffectiveAt;
    revision.status = "APPLYING";
    revision.reviewedAt = revision.reviewedAt || clock();
    revision.reviewedBy = revision.reviewedBy || adminId;
    await revision.save();
    let version;
    try {
      version = revision.toVersionId
        ? await Version.findById(revision.toVersionId)
        : await versions.createVersion(current.templateId, revision.proposedSeatConfig, {
          sourceVersionId: current._id,
          createdById: adminId,
          changeNote: revision.reason || "Reviewed fleet layout revision",
          publishTemplate: false,
          reuseExisting: true,
        });
      if (!version) throw new ApiError("FLEET_LAYOUT_INVALID");
      revision.toVersionId = version._id;
      await revision.save();
      await conflicts.blockSeats(check.tripIds, revision.removedSeatLabels, revision._id);
      await conflicts.assertSeatsClear(fleet._id, finalEffectiveAt, revision.removedSeatLabels);
      await tripRebase.stage(check.tripIds, version, finalEffectiveAt);
      await Fleet.updateOne({ _id: fleet._id }, {
        nextSeatLayoutVersionId: version._id, seatLayoutEffectiveAt: finalEffectiveAt,
      });
      await Schedule.updateMany(
        { busId: fleet._id, status: { $in: ["DRAFT", "ACTIVE", "SUSPENDED"] } },
        { nextSeatLayoutVersionId: version._id, seatLayoutEffectiveAt: finalEffectiveAt }
      );
      revision.status = "SCHEDULED";
      return revision.save();
    } catch (error) {
      if (version) await tripRebase.unstage(check.tripIds, version._id).catch(() => {});
      await conflicts.unblockSeats(check.tripIds, revision._id).catch(() => {});
      revision.status = "PENDING_REVIEW";
      await revision.save().catch(() => {});
      throw error;
    }
  }

  async function listForFleet(fleetId, ownerId = null) {
    await context.load(fleetId, ownerId);
    return Revision.find({ fleetId }).sort({ createdAt: -1 }).lean();
  }

  const listPending = () => Revision.find({ status: "PENDING_REVIEW" })
    .populate("fleetId", "busName busNumber ownerId").sort({ createdAt: 1 }).lean();

  return { requestRevision, decideRevision, listForFleet, listPending };
}

module.exports = { createSeatLayoutRevisionService };
