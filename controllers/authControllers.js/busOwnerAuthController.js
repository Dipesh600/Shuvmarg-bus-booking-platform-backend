/**
 * controllers/authControllers.js/busOwnerAuthController.js
 *
 * Self-registration flow for bus owners on their web portal.
 *
 * MULTI-ROLE IDENTITY SYSTEM:
 *   - Phone may already exist (e.g., registered as passenger or agent).
 *   - "Find-or-Upgrade" pattern: adds "busOwner" role to existing user OR creates new user.
 *   - User.status stays "active" — bus owner-specific approval lives on BusOwner.verificationStatus.
 *   - OTP is always required (proves phone ownership for security).
 *
 * Flow:
 *   1. sendOTP   → Role-aware phone check → 6-digit OTP with purpose=BUSOWNER_REGISTRATION
 *   2. verifyOTP → Constant-time verify → Phone confirmed, returns { exists, userName }
 *   3. register  → Find-or-Upgrade User + create BusOwner KYC skeleton
 *                  → NO dashboard until admin approves KYC (BusOwner.verificationStatus)
 *
 * Login uses the universal /api/login endpoint with X-App-Source: busOwner header.
 */

const User = require("../../models/userModel.js");
const BusOwner = require("../../models/busOwnerModel.js");
const bcrypt = require("bcryptjs");
const { checkPhoneForRole } = require("../../utils/phoneGuard.js");
const { createAndSendOTP, verifyOTPCode } = require("../../utils/otpHelper.js");
const { validatePassword } = require("../../utils/passwordValidator.js");
const { generateTokenPair } = require("../../utils/tokenService.js");

/**
 * POST /api/auth/busowner/sendOTP
 * Send OTP for bus owner self-registration.
 * Blocks only if the phone already has the "busOwner" role.
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

        // Role-aware phone check — only block if already a busOwner
        const { exists, hasRole, user } = await checkPhoneForRole(phone, "busOwner");

        if (exists && hasRole) {
            return res.status(409).json({
                success: false,
                message: "This phone number is already registered as a bus owner.",
                errorCode: "ROLE_ALREADY_REGISTERED",
            });
        }

        // Check if user is banned/deleted
        if (exists && user && (user.status === "banned" || user.status === "inactive")) {
            return res.status(403).json({
                success: false,
                message: "This account has been suspended. Contact support.",
                errorCode: "ACCOUNT_SUSPENDED",
            });
        }

        const result = await createAndSendOTP(phone, "BUSOWNER_REGISTRATION");

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
 * Returns whether the phone belongs to an existing user (for upgrade UX).
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

        const result = await verifyOTPCode(phone, otp, "BUSOWNER_REGISTRATION");
        if (!result.valid) {
            return res.status(400).json({
                success: false,
                message: result.error,
            });
        }

        // Race condition guard
        const { exists, hasRole, user } = await checkPhoneForRole(phone, "busOwner");
        if (exists && hasRole) {
            return res.status(409).json({
                success: false,
                message: "This phone number is already registered as a bus owner.",
                errorCode: "ROLE_ALREADY_REGISTERED",
            });
        }

        return res.status(200).json({
            success: true,
            message: exists
                ? "Phone verified! Existing account found — complete bus owner setup."
                : "Phone verified successfully! Complete your registration.",
            exists: exists,
            userName: exists && user ? user.name : null,
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
 * Complete bus owner self-registration using "Find-or-Upgrade" pattern.
 *
 * Scenarios:
 *   a. Phone NOT in DB → Create new User + BusOwner profile
 *   b. Phone exists, already has "busOwner" → Error
 *   c. Phone exists, different role → Add "busOwner" to roles[], create BusOwner profile
 */
const register = async (req, res) => {
    try {
        const { phone, name, password, email, companyName, address } = req.body;

        // Validate required fields
        if (!phone || !name || !companyName) {
            const missing = !phone ? "Phone" : !name ? "Name" : "Company Name";
            return res.status(400).json({
                success: false,
                message: `${missing} is required.`,
            });
        }

        // Verify OTP was completed
        const OTP = require("../../models/otpModel.js");
        const otpRecord = await OTP.findOne({ phone, purpose: "BUSOWNER_REGISTRATION", isUsed: true });
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

        // === FIND-OR-UPGRADE ===
        const { exists, hasRole, user: existingUser } = await checkPhoneForRole(phone, "busOwner");

        if (exists && hasRole) {
            return res.status(409).json({
                success: false,
                message: "This phone number is already registered as a bus owner.",
                errorCode: "ROLE_ALREADY_REGISTERED",
            });
        }

        let savedUser;

        if (exists && existingUser) {
            // === UPGRADE PATH: Existing user → add "busOwner" role ===
            savedUser = await User.findByIdAndUpdate(
                existingUser._id,
                {
                    $addToSet: { roles: "busOwner" },
                    $set: {
                        [`roleActivatedAt.busOwner`]: new Date(),
                    },
                },
                { new: true }
            );
        } else {
            // === NEW USER PATH ===
            if (!password) {
                return res.status(400).json({
                    success: false,
                    message: "Password is required for new registration.",
                });
            }

            const passwordCheck = validatePassword(password);
            if (!passwordCheck.valid) {
                return res.status(400).json({
                    success: false,
                    message: passwordCheck.errors[0],
                    errors: passwordCheck.errors,
                });
            }

            if (email) {
                const emailExists = await User.findOne({ email: email.toLowerCase() });
                if (emailExists) {
                    return res.status(409).json({
                        success: false,
                        message: "This email is already registered.",
                    });
                }
            }

            const hashedPassword = await bcrypt.hash(password, 12);
            const userData = {
                name,
                phone,
                password: hashedPassword,
                role: "busOwner",
                roles: ["busOwner"],
                status: "active",           // NOT "pending" — approval is on BusOwner model
                phoneVerified: true,
                isVerified: false,
                roleActivatedAt: { busOwner: new Date() },
            };
            if (email) userData.email = email.toLowerCase();
            if (address) userData.address = address;

            const newUser = new User(userData);
            savedUser = await newUser.save();
        }

        // Create BusOwner KYC skeleton (always needed for new busOwner role)
        const existingBusOwner = await BusOwner.findOne({ user: savedUser._id });
        if (!existingBusOwner) {
            const newBusOwner = new BusOwner({
                user: savedUser._id,
                companyName,
                verificationStatus: "pending",
            });
            await newBusOwner.save();
        }

        // Generate tokens with activeRole: "busOwner"
        const { accessToken, refreshToken } = await generateTokenPair(savedUser, {
            deviceInfo: req.get("User-Agent") || null,
            ipAddress: req.ip || req.connection?.remoteAddress || null,
            activeRole: "busOwner",
        });

        const userObj = savedUser.toObject ? savedUser.toObject() : { ...savedUser };
        delete userObj.password;

        const responseData = {
            success: true,
            message: exists
                ? "Bus owner role added to your account! Submit KYC documents to activate."
                : "Registration successful! Submit your KYC documents to activate your account.",
            user: userObj,
            accessToken,
            activeRole: "busOwner",
            isUpgrade: !!exists,
        };
        if (refreshToken) responseData.refreshToken = refreshToken;

        return res.status(201).json(responseData);
    } catch (error) {
        console.error("BusOwner register error:", error);

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
