"use strict";

const { ApiError } = require("../../contracts");
const {
  validateSeatLayout,
  seatLayoutFingerprint,
} = require("../../domain/seat-layout/seat-layout.validation");
const { SeatLayoutError } = require("../../domain/seat-layout/seat-layout.error");

function parseAndValidate(value) {
  let input = value;
  if (typeof value === "string") {
    try { input = JSON.parse(value); }
    catch (error) {
      throw new ApiError("FLEET_LAYOUT_INVALID", {
        cause: error, details: { reason: "Seat layout JSON is malformed." },
      });
    }
  }
  try { return validateSeatLayout(input); }
  catch (error) {
    if (!(error instanceof SeatLayoutError)) throw error;
    throw new ApiError("FLEET_LAYOUT_INVALID", {
      cause: error,
      details: { reason: error.message, path: error.details?.path },
    });
  }
}

function createSeatLayoutVerifier({ getTripModel, logger = console }) {
  return async function verifySeatLayout(fleet, updateData) {
    if (updateData.seatConfig === undefined) {
      if (
        updateData.totalSeats !== undefined &&
        Number(updateData.totalSeats) !== Number(fleet.totalSeats)
      ) throw new ApiError("FLEET_LAYOUT_INVALID", {
        details: { reason: "Capacity cannot change without a complete seat layout." },
      });
      return;
    }
    const layout = parseAndValidate(updateData.seatConfig);
    if (
      updateData.totalSeats !== undefined &&
      Number(updateData.totalSeats) !== layout.totalSeats
    ) throw new ApiError("FLEET_LAYOUT_INVALID", {
      details: {
        expectedSeats: layout.totalSeats,
        receivedSeats: Number(updateData.totalSeats),
      },
    });
    updateData.seatConfig = layout.seatConfig;
    updateData.totalSeats = layout.totalSeats;
    let unchanged = false;
    try {
      unchanged = seatLayoutFingerprint(fleet.seatConfig) ===
        seatLayoutFingerprint(layout.seatConfig);
    } catch {
      unchanged = false;
    }
    if (unchanged) return;
    try {
      const Trip = getTripModel();
      const count = await Trip.countDocuments({
        busId: fleet._id,
        status: { $in: ["scheduled", "boarding", "in-transit"] },
      });
      if (count > 0) {
        throw new ApiError("FLEET_LAYOUT_CHANGE_BLOCKED", {
          details: { activeTripCount: count },
        });
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("Trip verification failed during layout update:", error);
      throw new ApiError("FLEET_LAYOUT_CHECK_FAILED", { cause: error });
    }
  };
}

module.exports = { createSeatLayoutVerifier, parseAndValidate };
