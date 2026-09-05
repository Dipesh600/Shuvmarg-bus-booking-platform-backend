"use strict";
const User = require("../../../../models/userModel");
const DriverProfile = require("../../../../models/driverProfileModel");
const ConductorProfile = require("../../../../models/conductorProfileModel");
const mongoose = require("mongoose");

async function activateInvitedUser({ userId, hashedPassword }) {
    const activatedAt = new Date();
    const session = await mongoose.startSession();
    let user;
    try {
        await session.withTransaction(async () => {
            const current = await User.findOne({ _id: userId, status: "invited" })
                .select("+password").session(session);
            if (!current) throw new Error("Activation state changed. Restart account setup.");
            current.password = hashedPassword;
            current.status = "active";
            current.forcePasswordChange = false;
            current.phoneVerified = true;
            current.isVerified = true;
            await current.save({ session });
            const accessUpdate = {
                $set: { accessStatus: "ACTIVE", activatedAt,
                    invitationDeliveryStatus: "NOT_REQUIRED",
                    accessStatusBeforeSuspension: null },
            };
            await Promise.all([
                DriverProfile.updateMany({ userId: current._id, accessStatus: "INVITED", removedAt: null },
                    accessUpdate, { session, runValidators: true }),
                ConductorProfile.updateMany({ userId: current._id, accessStatus: "INVITED", removedAt: null },
                    accessUpdate, { session, runValidators: true }),
            ]);
            user = current;
        });
    } finally {
        await session.endSession();
    }
    return user;
}
module.exports = { activateInvitedUser };
