/**
 * controllers/authControllers.js/activateAccountController.js
 *
 * Account activation for conductors, drivers, and admin-onboarded bus owners.
 *
 * Flow:
 *   1. Staff receives SMS with phone + temp password
 *   2. Staff logs in → gets forcePasswordChange: true + tempToken
 *   3. Staff calls POST /api/auth/activate with:
 *      { tempToken, newPassword, phone, otp }
 *   4. OTP verifies phone ownership
 *   5. Password is changed, forcePasswordChange set to false
 *   6. Full access token + refresh token issued
 *
 * This is essentially the same as changeForcePassword but with OTP required.
 * Separated for clarity — this is the dedicated "invited user activation" flow.
 */

const User = require("../../models/userModel.js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createAndSendOTP, verifyOTPCode } = require("../../utils/otpHelper.js");
const { validatePassword } = require("../../utils/passwordValidator.js");
const { generateTokenPair } = require("../../utils/tokenService.js");

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

        // Verify this phone belongs to an invited user
        const user = await User.findOne({ phone, status: "invited" });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "No pending activation found for this phone number.",
            });
        }

        const result = await createAndSendOTP(phone, "ACCOUNT_ACTIVATION");

        return res.status(200).json({
            success: true,
            message: "Activation OTP sent!",
            data: { phone, expiresIn: result.expiresIn },
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

        // Find the invited user
        const user = await User.findOne({ phone, status: "invited" }).select("+password");
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "No pending activation found for this phone number.",
            });
        }

        // Verify OTP
        const otpResult = await verifyOTPCode(phone, otp, "ACCOUNT_ACTIVATION");
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

        // Update user
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        user.password = hashedPassword;
        user.status = "active";
        user.forcePasswordChange = false;
        user.phoneVerified = true;
        user.isVerified = true;
        await user.save();

        // Generate full token pair
        const { accessToken, refreshToken } = await generateTokenPair(user, {
            deviceInfo: req.get("User-Agent") || null,
            ipAddress: req.ip || req.connection?.remoteAddress || null,
        });

        const userWithoutPassword = user.toObject();
        delete userWithoutPassword.password;

        const responseData = {
            success: true,
            message: "Account activated successfully! Welcome to Sumarg.",
            user: userWithoutPassword,
            accessToken,
        };
        if (refreshToken) responseData.refreshToken = refreshToken;

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
