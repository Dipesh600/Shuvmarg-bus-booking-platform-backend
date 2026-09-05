/**
 * controllers/authControllers.js/activateAccountController.js
 *
 * Account activation for invited agents, conductors, and drivers.
 *
 * Flow:
 *   1. A genuinely new staff account is stored as invited.
 *   2. Staff verifies their phone with an activation OTP.
 *   3. Staff creates a password.
 *   4. User and linked role-access records become active atomically.
 *   5. Full access token + refresh token are issued.
 *
 * This is essentially the same as changeForcePassword but with OTP required.
 * Separated for clarity — this is the dedicated "invited user activation" flow.
 */

const User = require("../../models/userModel.js");
const DriverProfile = require("../../models/driverProfileModel.js");
const ConductorProfile = require("../../models/conductorProfileModel.js");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { createAndSendOTP, verifyOTPCode } = require("../../utils/otpHelper.js");
const { validatePassword } = require("../../utils/passwordValidator.js");
const { generateTokenPair, revokeAllUserTokens } = require("../../utils/tokenService.js");
const { buildPhoneQuery } = require("../../utils/phoneGuard.js");
const {
    requestedActivationRole,
    activationEligibility,
} = require("../../src/modules/auth/account-activation/account-activation.policy.js");

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

/**
 * POST /api/auth/activate/sendOTP
 * Send activation OTP to the invited user's phone.
 */
const sendActivationOTP = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: "Phone number is required.",
            });
        }

        const { role, user, eligibility } = await activationContext(req);
        if (eligibility.state !== "PENDING") return sendEligibilityFailure(res, eligibility);

        const result = await createAndSendOTP(user.phone, "ACCOUNT_ACTIVATION");

        return res.status(200).json({
            success: true,
            message: "Activation OTP sent!",
            data: {
                phone: user.phone,
                role,
                activationState: "OTP_SENT",
                expiresIn: result.expiresIn,
            },
        });
    } catch (error) {
        console.error("sendActivationOTP error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to send OTP.",
        });
    }
};

/**
 * POST /api/auth/activate
 * Activate an invited account — set new password, verify phone via OTP.
 *
 * Body: { phone, otp, newPassword }
 */
const activateAccount = async (req, res) => {
    try {
        const { phone, otp, newPassword } = req.body;

        if (!phone || !otp || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Phone, OTP, and new password are required.",
            });
        }

        const context = await activationContext(req);
        const { role, eligibility } = context;
        let { user } = context;
        if (eligibility.state !== "PENDING") return sendEligibilityFailure(res, eligibility);

        // Verify OTP
        const otpResult = await verifyOTPCode(user.phone, otp, "ACCOUNT_ACTIVATION");
        if (!otpResult.valid) {
            return res.status(400).json({
                success: false,
                message: otpResult.error,
            });
        }

        // Validate password
        const passwordCheck = validatePassword(newPassword);
        if (!passwordCheck.valid) {
            return res.status(400).json({
                success: false,
                message: passwordCheck.errors[0],
                errors: passwordCheck.errors,
            });
        }

        // Update the shared account and every invited crew-role record in one
        // transaction so the UI can never show a stale inferred state.
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        const activatedAt = new Date();
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const current = await User.findOne({ _id: user._id, status: "invited" })
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

        // Revoke all prior sessions before issuing new credentials (FINDING-07)
        await revokeAllUserTokens(user._id);

        // Generate full token pair
        const { accessToken, refreshToken } = await generateTokenPair(user, {
            deviceInfo: req.get("User-Agent") || null,
            ipAddress: req.ip || req.connection?.remoteAddress || null,
            activeRole: role,
        });

        const userWithoutPassword = user.toObject();
        delete userWithoutPassword.password;

        const responseData = {
            success: true,
            message: "Account activated successfully! Welcome to Sumarg.",
            user: userWithoutPassword,
            accessToken,
            activeRole: role,
        };
        // Refresh token delivered via httpOnly cookie only — not in response body (FINDING-06)
        if (refreshToken) {
            res.cookie("refreshToken", refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "Lax",
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });
        }

        return res.status(200).json(responseData);
    } catch (error) {
        console.error("activateAccount error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

module.exports = {
    sendActivationOTP,
    activateAccount,
};
