"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const BusModel = require("../../../models/fleetModel");
const BusOwnerModel = require("../../../models/busOwnerModel");
const UserModel = require("../../../models/userModel");

test("fleet-approval-push-validation real Mongoose $push tests", async () => {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  try {
    const user = await UserModel.create({
      name: "Owner User",
      email: "owner-push-test@example.com",
      password: "Password123!",
      phone: "9800000099",
      role: "busOwner",
      roles: ["busOwner"],
    });

    await BusOwnerModel.create({
      user: user._id,
      companyName: "Push Test Bus Pvt Ltd",
      verificationStatus: "approved",
    });

    const fleet = await BusModel.create({
      ownerId: user._id,
      busName: "Push Test Bus",
      busNumber: "BA-1-PA-9999",
      busType: "DELUXE",
      vehicleType: "bus",
      totalSeats: 30,
      approvalStatus: "REJECTED",
      status: "INACTIVE",
    });

    // 1. Real Fleet findOneAndUpdate accepts valid FLEET_RESUBMITTED with runValidators enabled
    const updated = await BusModel.findOneAndUpdate(
      { _id: fleet._id, __v: fleet.__v },
      {
        $set: {
          approvalStatus: "PENDING",
          status: "INACTIVE",
          "documentReviews.fitnessCert.status": "pending",
        },
        $push: {
          approvalAuditHistory: {
            eventType: "FLEET_RESUBMITTED",
            actorType: "BUS_OWNER",
            actorId: user._id,
            fromStatus: "REJECTED",
            toStatus: "PENDING",
            occurredAt: new Date(),
          },
        },
        $inc: { __v: 1 },
      },
      { new: true, runValidators: true }
    );

    assert.ok(updated);
    assert.equal(updated.approvalStatus, "PENDING");

    const fetched = await BusModel.findById(fleet._id).select("+approvalAuditHistory").lean();
    assert.equal(fetched.approvalAuditHistory.length, 1);
    assert.equal(fetched.approvalAuditHistory[0].eventType, "FLEET_RESUBMITTED");

    // 2. Real Fleet findOneAndUpdate rejects invalid transition (FLEET_APPROVED with BUS_OWNER)
    await assert.rejects(
      async () => BusModel.findOneAndUpdate(
        { _id: fleet._id, __v: updated.__v },
        {
          $push: {
            approvalAuditHistory: {
              eventType: "FLEET_APPROVED",
              actorType: "BUS_OWNER",
              actorId: user._id,
              fromStatus: "PENDING",
              toStatus: "APPROVED",
              occurredAt: new Date(),
            },
          },
        },
        { new: true, runValidators: true }
      ),
      (err) => err.name === "ValidationError"
    );

    // 3. Real Fleet findOneAndUpdate rejects invalid transition (FLEET_RESUBMITTED with PENDING -> PENDING)
    await assert.rejects(
      async () => BusModel.findOneAndUpdate(
        { _id: fleet._id, __v: updated.__v },
        {
          $push: {
            approvalAuditHistory: {
              eventType: "FLEET_RESUBMITTED",
              actorType: "BUS_OWNER",
              actorId: user._id,
              fromStatus: "PENDING",
              toStatus: "PENDING",
              occurredAt: new Date(),
            },
          },
        },
        { new: true, runValidators: true }
      ),
      (err) => err.name === "ValidationError"
    );
  } finally {
    await mongoose.disconnect();
    await mongoServer.stop();
  }
});
