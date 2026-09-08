/** Activate an invited account after OTP verification and password setup. */

const { activateInvitedUser } = require("../../src/modules/auth/account-activation/account-activation-persistence.service");
const bcrypt = require("bcryptjs");
const { createAndSendOTP, verifyOTPCode } = require("../../utils/otpHelper.js");
const { validatePassword } = require("../../utils/passwordValidator.js");
const { generateTokenPair, revokeAllUserTokens } = require("../../utils/tokenService.js");
const { activationContext, sendEligibilityFailure } = require("../../src/modules/auth/account-activation/account-activation-context");

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
        user = await activateInvitedUser({ userId: user._id, hashedPassword });

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
