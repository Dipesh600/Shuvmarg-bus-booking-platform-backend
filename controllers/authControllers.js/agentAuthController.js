/**
 * controllers/authControllers.js/agentAuthController.js
 *
 * Self-registration flow for agents on their own app.
 *
 * Flow:
 *   1. sendOTP   → Global phone check → 6-digit OTP with purpose=REGISTRATION
 *   2. verifyOTP → Constant-time verify → Phone confirmed
 *   3. register  → Creates User (role: agent, status: pending) + Agent KYC skeleton
 *                  → NO booking dashboard until admin approves KYC
 *
 * Login uses the universal /api/login endpoint (same as all entities).
 */

const User = require("../../models/userModel.js");
const Agent = require("../../models/agentModel.js");
const bcrypt = require("bcryptjs");
const { isPhoneRegistered } = require("../../utils/phoneGuard.js");
const { createAndSendOTP, verifyOTPCode } = require("../../utils/otpHelper.js");
const { validatePassword } = require("../../utils/passwordValidator.js");
const { generateTokenPair } = require("../../utils/tokenService.js");

/**
 * POST /api/auth/agent/sendOTP
 * Send OTP for agent self-registration.
 */
const sendOTP = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: "Phone number is required.",
            });
        }

        // Global phone uniqueness
        const { registered } = await isPhoneRegistered(phone);
        if (registered) {
            return res.status(409).json({
                success: false,
                message: "This phone number is already registered.",
                errorCode: "PHONE_ALREADY_REGISTERED",
            });
        }

        const result = await createAndSendOTP(phone, "REGISTRATION");

        return res.status(200).json({
            success: true,
            message: "OTP sent successfully!",
            data: { phone, expiresIn: result.expiresIn },
        });
    } catch (error) {
        console.error("Agent sendOTP error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to send OTP.",
            error: error.message,
        });
    }
};

/**
 * POST /api/auth/agent/verifyOTP
 * Verify OTP for agent self-registration.
 */
const verifyOTP = async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.status(400).json({
                success: false,
                message: "Phone and OTP are required.",
            });
        }

        const result = await verifyOTPCode(phone, otp, "REGISTRATION");
        if (!result.valid) {
            return res.status(400).json({
                success: false,
                message: result.error,
            });
        }

        // Race condition guard
        const { registered } = await isPhoneRegistered(phone);
        if (registered) {
            return res.status(409).json({
                success: false,
                message: "This phone number is already registered.",
                errorCode: "PHONE_ALREADY_REGISTERED",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Phone verified successfully! Complete your registration.",
        });
    } catch (error) {
        console.error("Agent verifyOTP error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to verify OTP.",
            error: error.message,
        });
    }
};

/**
 * POST /api/auth/agent/register
 * Complete agent self-registration.
 * Creates User (pending) + empty Agent KYC profile.
 * Agent must submit KYC docs separately, then admin approves.
 */
const register = async (req, res) => {
    try {
        const { phone, name, password, email, agentCompanyName, address } = req.body;

        // Validate required fields
        if (!phone || !name || !password) {
            const missing = !phone ? "Phone" : !name ? "Name" : "Password";
            return res.status(400).json({
                success: false,
                message: `${missing} is required.`,
            });
        }

        // Verify OTP was completed
        const OTP = require("../../models/otpModel.js");
        const otpRecord = await OTP.findOne({ phone, purpose: "REGISTRATION", isUsed: true });
        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: "Phone not verified. Complete OTP verification first.",
            });
        }

        // Check OTP verification was recent
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        if (otpRecord.updatedAt < thirtyMinutesAgo) {
            return res.status(400).json({
                success: false,
                message: "OTP verification expired. Please verify your phone again.",
            });
        }

        // Global phone uniqueness
        const { registered } = await isPhoneRegistered(phone);
        if (registered) {
            return res.status(409).json({
                success: false,
                message: "This phone number is already registered.",
                errorCode: "PHONE_ALREADY_REGISTERED",
            });
        }

        // Email uniqueness (if provided)
        if (email) {
            const emailExists = await User.findOne({ email: email.toLowerCase() });
            if (emailExists) {
                return res.status(409).json({
                    success: false,
                    message: "This email is already registered.",
                });
            }
        }

        // Validate password
        const passwordCheck = validatePassword(password);
        if (!passwordCheck.valid) {
            return res.status(400).json({
                success: false,
                message: passwordCheck.errors[0],
                errors: passwordCheck.errors,
            });
        }

        // Create User
        const hashedPassword = await bcrypt.hash(password, 12);
        const userData = {
            name,
            phone,
            password: hashedPassword,
            role: "agent",
            status: "pending",
            phoneVerified: true,
            isVerified: false,
        };
        if (email) userData.email = email.toLowerCase();
        if (address) userData.address = address;

        const newUser = new User(userData);
        const savedUser = await newUser.save();

        // Create Agent KYC skeleton
        const newAgent = new Agent({
            user: savedUser._id,
            agentCompanyName: agentCompanyName || null,
            verificationStatus: "pending",
        });
        await newAgent.save();

        // Generate tokens
        const { accessToken, refreshToken } = await generateTokenPair(savedUser, {
            deviceInfo: req.get("User-Agent") || null,
            ipAddress: req.ip || req.connection?.remoteAddress || null,
        });

        const userWithoutPassword = savedUser.toObject();
        delete userWithoutPassword.password;

        const responseData = {
            success: true,
            message: "Registration successful! Submit your KYC documents to activate your account.",
            user: userWithoutPassword,
            accessToken,
        };
        if (refreshToken) responseData.refreshToken = refreshToken;

        return res.status(201).json(responseData);
    } catch (error) {
        console.error("Agent register error:", error);

        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern || {})[0];
            return res.status(409).json({
                success: false,
                message: `${field === "phone" ? "Phone number" : field === "email" ? "Email" : "Value"} is already registered.`,
            });
        }

        return res.status(500).json({
            success: false,
            message: "Failed to complete registration.",
            error: error.message,
        });
    }
};

module.exports = {
    sendOTP,
    verifyOTP,
    register,
};
