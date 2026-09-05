"use strict";
const User = require("../../../../models/userModel");
const DriverProfile = require("../../../../models/driverProfileModel");
const ConductorProfile = require("../../../../models/conductorProfileModel");
const { buildPhoneQuery } = require("../../../../utils/phoneGuard");
const { requestedActivationRole, activationEligibility } = require("./account-activation.policy");

const sendEligibilityFailure = (res, eligibility) => res
    .status(eligibility.statusCode)
    .json({
        success: false,
        message: eligibility.message,
        errorCode: eligibility.errorCode,
        activationState: eligibility.state,
    });

const activationContext = async (req) => {
    const role = requestedActivationRole(req.get("X-App-Source"));
    if (!role) return { role, user: null, eligibility: activationEligibility(null, role) };
    const user = await User.findOne(buildPhoneQuery(req.body.phone, { includeDeleted: true }))
        .select("+password");
    let hasPendingInvitation = true;
    if (user?.status === "invited" && role === "driver") {
        hasPendingInvitation = await DriverProfile.exists({
            userId: user._id, accessStatus: "INVITED", removedAt: null,
        });
    } else if (user?.status === "invited" && role === "conductor") {
        hasPendingInvitation = await ConductorProfile.exists({
            userId: user._id, accessStatus: "INVITED", removedAt: null,
        });
    }
    return {
        role,
        user,
        eligibility: activationEligibility(user, role, { hasPendingInvitation: Boolean(hasPendingInvitation) }),
    };
};

module.exports = { activationContext, sendEligibilityFailure };
