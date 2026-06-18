/**
 * controllers/authControllers.js/agentAuthController.js
 *
 * Self-registration flow for agents on their own app.
 *
 * MULTI-ROLE IDENTITY SYSTEM:
 *   - Phone may already exist (e.g., registered as passenger).
 *   - "Find-or-Upgrade" pattern: adds "agent" role to existing user OR creates new user.
 *   - User.status stays "active" — agent-specific approval lives on Agent.applicationStatus.
 *   - OTP is always required (proves phone ownership for security).
 *
 * Flow:
 *   1. sendOTP   → Role-aware phone check → 6-digit OTP with purpose=AGENT_REGISTRATION
 *   2. verifyOTP → Constant-time verify → Phone confirmed, returns { exists, userName }
 *   3. register  → Find-or-Upgrade User + create Agent KYC skeleton
 *                  → NO booking dashboard until admin approves KYC (Agent.applicationStatus)
 *
 * Login uses the universal /api/login endpoint with X-App-Source: agent header.
 */

const User = require("../../models/userModel.js");
const Agent = require("../../models/agentModel.js");
const bcrypt = require("bcryptjs");
const { checkPhoneForRole } = require("../../utils/phoneGuard.js");
const { createAndSendOTP, verifyOTPCode } = require("../../utils/otpHelper.js");
const { validatePassword } = require("../../utils/passwordValidator.js");
const { generateTokenPair } = require("../../utils/tokenService.js");

/**
 * POST /api/auth/agent/sendOTP
 * Send OTP for agent self-registration.
 * Blocks only if the phone already has the "agent" role.
 * Allows through if phone exists under a different role (upgrade flow).
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

        // Role-aware phone check — only block if already an agent
        const { exists, hasRole, user } = await checkPhoneForRole(phone, "agent");

        if (exists && hasRole) {
            return res.status(409).json({
                success: false,
                message: "This phone number is already registered as an agent.",
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

        const result = await createAndSendOTP(phone, "AGENT_REGISTRATION");

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

        const result = await verifyOTPCode(phone, otp, "AGENT_REGISTRATION");
        if (!result.valid) {
            return res.status(400).json({
                success: false,
                message: result.error,
            });
        }

        // Race condition guard — re-check after OTP verify
        const { exists, hasRole, user } = await checkPhoneForRole(phone, "agent");
        if (exists && hasRole) {
            return res.status(409).json({
                success: false,
                message: "This phone number is already registered as an agent.",
                errorCode: "ROLE_ALREADY_REGISTERED",
            });
        }

        // Return upgrade context to the client
        return res.status(200).json({
            success: true,
            message: exists
                ? "Phone verified! Existing account found — complete agent setup."
                : "Phone verified successfully! Complete your registration.",
            // For the app to show "Welcome Ram! Set up your agent account."
            exists: exists,
            userName: exists && user ? user.name : null,
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
 * Complete agent self-registration using "Find-or-Upgrade" pattern.
 *
 * Scenarios:
 *   a. Phone NOT in DB → Create new User + Agent profile
 *   b. Phone exists, already has "agent" → Error
 *   c. Phone exists, different role → Add "agent" to roles[], create Agent profile
 *      (password stays unchanged, User.status stays "active")
 */
const register = async (req, res) => {
    try {
        const { phone, name, password, email, agentCompanyName, address } = req.body;

        // Validate required fields
        if (!phone || !name) {
            const missing = !phone ? "Phone" : "Name";
            return res.status(400).json({
                success: false,
                message: `${missing} is required.`,
            });
        }

        // Verify OTP was completed
        const OTP = require("../../models/otpModel.js");
        const otpRecord = await OTP.findOne({ phone, purpose: "AGENT_REGISTRATION", isUsed: true });
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
        const { exists, hasRole, user: existingUser } = await checkPhoneForRole(phone, "agent");

        if (exists && hasRole) {
            return res.status(409).json({
                success: false,
                message: "This phone number is already registered as an agent.",
                errorCode: "ROLE_ALREADY_REGISTERED",
            });
        }

        let savedUser;

        if (exists && existingUser) {
            // === UPGRADE PATH: Existing user → add "agent" role ===
            // Password stays unchanged. User.status stays "active".
            // Only agent-specific info is collected.
            savedUser = await User.findByIdAndUpdate(
                existingUser._id,
                {
                    $addToSet: { roles: "agent" },
                    $set: {
                        [`roleActivatedAt.agent`]: new Date(),
                    },
                },
                { new: true }
            );
        } else {
            // === NEW USER PATH: Create fresh User with agent role ===
            if (!password) {
                return res.status(400).json({
                    success: false,
                    message: "Password is required for new registration.",
                });
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

            const hashedPassword = await bcrypt.hash(password, 12);
            const userData = {
                name,
                phone,
                password: hashedPassword,
                role: "agent",
                roles: ["agent"],
                status: "active",           // NOT "pending" — agent approval is on Agent model
                phoneVerified: true,
                isVerified: false,
                roleActivatedAt: { agent: new Date() },
            };
            if (email) userData.email = email.toLowerCase();
            if (address) userData.address = address;

            const newUser = new User(userData);
            savedUser = await newUser.save();
        }

        // Create Agent KYC skeleton (always needed for new agent role)
        const existingAgent = await Agent.findOne({ user: savedUser._id });
        if (!existingAgent) {
            const newAgent = new Agent({
                user: savedUser._id,
                agentCompanyName: agentCompanyName || null,
                verificationStatus: "pending",
            });
            await newAgent.save();
        }

        // Generate tokens with activeRole: "agent"
        const { accessToken, refreshToken } = await generateTokenPair(savedUser, {
            deviceInfo: req.get("User-Agent") || null,
            ipAddress: req.ip || req.connection?.remoteAddress || null,
            activeRole: "agent",
        });

        const userObj = savedUser.toObject ? savedUser.toObject() : { ...savedUser };
        delete userObj.password;

        const responseData = {
            success: true,
            message: exists
                ? "Agent role added to your account! Submit KYC documents to activate."
                : "Registration successful! Submit your KYC documents to activate your agent account.",
            user: userObj,
            accessToken,
            activeRole: "agent",
            isUpgrade: !!exists,
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
