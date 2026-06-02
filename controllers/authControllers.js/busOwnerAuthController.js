/**
 * controllers/authControllers.js/busOwnerAuthController.js
 *
 * Self-registration flow for bus owners on their own web portal.
 *
 * Flow:
 *   1. sendOTP      → Global phone check → 6-digit OTP with purpose=REGISTRATION
 *   2. verifyOTP    → Constant-time verify → Phone confirmed
 *   3. register     → Creates User (role: busOwner, status: pending) + BusOwner KYC skeleton
 *                     → NO dashboard access until admin approves KYC
 *
 * Login uses the universal /api/login endpoint (same as passenger).
 */

const User = require("../../models/userModel.js");
const BusOwner = require("../../models/busOwnerModel.js");
const bcrypt = require("bcryptjs");
const { isPhoneRegistered } = require("../../utils/phoneGuard.js");
const { createAndSendOTP, verifyOTPCode } = require("../../utils/otpHelper.js");
const { validatePassword } = require("../../utils/passwordValidator.js");
const { generateTokenPair } = require("../../utils/tokenService.js");

/**
 * POST /api/auth/busowner/sendOTP
 * Send OTP for bus owner self-registration.
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

        // Global phone uniqueness — blocks if phone exists under ANY role
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
        console.error("BusOwner sendOTP error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to send OTP.",
            error: error.message,
        });
    }
};

/**
 * POST /api/auth/busowner/verifyOTP
 * Verify OTP for bus owner self-registration.
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
        console.error("BusOwner verifyOTP error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to verify OTP.",
            error: error.message,
        });
    }
};

/**
 * POST /api/auth/busowner/register
 * Complete bus owner self-registration.
 * Creates User (pending) + empty BusOwner KYC profile.
 * Bus owner must submit KYC separately, then admin approves.
 */
const register = async (req, res) => {
    try {
        const { phone, name, password, email, companyName, address } = req.body;

        // Validate required fields
        if (!phone || !name || !password || !companyName) {
            const missing = !phone ? "Phone" : !name ? "Name" : !password ? "Password" : "Company Name";
            return res.status(400).json({
                success: false,
                message: `${missing} is required.`,
            });
        }

        // Verify OTP was completed for REGISTRATION
        const OTP = require("../../models/otpModel.js");
        const otpRecord = await OTP.findOne({ phone, purpose: "REGISTRATION", isUsed: true });
        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: "Phone not verified. Complete OTP verification first.",
            });
        }

        // Check OTP verification was recent (30 min window)
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
            role: "busOwner",
            status: "pending",      // No dashboard until admin approves
            phoneVerified: true,
            isVerified: false,       // KYC not yet submitted
        };
        if (email) userData.email = email.toLowerCase();
        if (address) userData.address = address;

        const newUser = new User(userData);
        const savedUser = await newUser.save();

        // Create BusOwner KYC skeleton (empty — bus owner fills KYC later on portal)
        const newBusOwner = new BusOwner({
            user: savedUser._id,
            companyName,
            verificationStatus: "pending",
        });
        await newBusOwner.save();

        // Generate tokens — they can access their portal to submit KYC
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
        console.error("BusOwner register error:", error);

        // Handle Mongoose duplicate key error
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
