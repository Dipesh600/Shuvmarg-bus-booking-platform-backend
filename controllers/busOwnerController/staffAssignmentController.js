/**
 * controllers/busOwnerController/staffAssignmentController.js
 *
 * Bus owner assigns conductors and drivers to their fleet/brand.
 * No self-registration for staff — bus owner creates them.
 *
 * Flow:
 *   1. Bus owner calls assignConductor/assignDriver with { phone, name, brandId }
 *   2. Backend creates User (role: conductor/driver, status: invited, forcePasswordChange: true)
 *   3. Backend creates ConductorProfile/DriverProfile linked to brand
 *   4. SMS sent to the assigned person with activation instructions
 *   5. Staff activates via POST /api/auth/activate
 *   6. Staff can now login normally
 */

const User = require("../../models/userModel.js");
const ConductorProfile = require("../../models/conductorProfileModel.js");
const DriverProfile = require("../../models/driverProfileModel.js");
const OperatorBrand = require("../../models/operatorBrandModel.js");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { checkPhoneForRole } = require("../../utils/phoneGuard.js");
const { revokeAllUserTokens } = require("../../utils/tokenService.js");
const sendSMS = require("../../handlers/sparro-otp.js");

/**
 * Generate a random temporary password.
 */
const generateTempPassword = () => {
    // 10-char alphanumeric — strong enough for a temp password
    return crypto.randomBytes(5).toString("hex").toUpperCase();
};

/**
 * Verify the bus owner actually owns the brand.
 */
const verifyBrandOwnership = async (ownerId, brandId) => {
    const brand = await OperatorBrand.findOne({ _id: brandId, ownerId }).lean();
    return brand;
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/busowner/assignConductor
// Body: { phone, name, brandId }
// ─────────────────────────────────────────────────────────────────────────────
const assignConductor = async (req, res) => {
    try {
        const ownerId = req.userInfo?.id;
        const { phone, name, brandId } = req.body;

        if (!phone || !name || !brandId) {
            const missing = !phone ? "Phone" : !name ? "Name" : "Brand ID";
            return res.status(400).json({
                success: false,
                message: `${missing} is required.`,
            });
        }

        // Verify brand ownership
        const brand = await verifyBrandOwnership(ownerId, brandId);
        if (!brand) {
            return res.status(403).json({
                success: false,
                message: "You do not own this brand.",
            });
        }

        // Role-aware phone check — only block if already a conductor
        const { exists, hasRole, user: existingUser } = await checkPhoneForRole(phone, "conductor");

        if (exists && hasRole) {
            return res.status(409).json({
                success: false,
                message: "This phone number is already registered as a conductor.",
                errorCode: "ROLE_ALREADY_REGISTERED",
            });
        }

        let savedUser;

        if (exists && existingUser) {
            // === UPGRADE PATH: Add conductor role to existing user ===
            savedUser = await User.findByIdAndUpdate(
                existingUser._id,
                {
                    $addToSet: { roles: "conductor" },
                    $set: {
                        [`roleActivatedAt.conductor`]: new Date(),
                        // Don't overwrite status — only set invited if currently active
                        // so they know to activate conductor mode
                    },
                },
                { new: true }
            );
        } else {
            // === NEW USER PATH ===
            const tempPassword = generateTempPassword();
            const hashedPassword = await bcrypt.hash(tempPassword, 12);

            const newUser = new User({
                name,
                phone,
                password: hashedPassword,
                role: "conductor",
                roles: ["conductor"],
                status: "invited",
                forcePasswordChange: true,
                phoneVerified: false,
                roleActivatedAt: { conductor: new Date() },
            });
            savedUser = await newUser.save();

            // SMS invite with temp password (only for new users)
            try {
                await sendSMS(
                    phone,
                    `You've been assigned as conductor on Sumarg (${brand.name}). Login with Phone: ${phone} | Temp Password: ${tempPassword} — Change your password on first login.`
                );
            } catch (smsErr) {
                console.warn("[assignConductor] SMS failed (non-fatal):", smsErr.message);
            }
        }

        // Create ConductorProfile (if not already exists)
        let profile = await ConductorProfile.findOne({ userId: savedUser._id, brandId });
        if (!profile) {
            profile = new ConductorProfile({
                brandId,
                ownerId,
                userId: savedUser._id,
                fullName: name,
                phone,
                assignedBy: ownerId,
            });
            await profile.save();
        }

        return res.status(201).json({
            success: true,
            message: exists
                ? `Conductor role added to existing user (${existingUser.name}). They can now access conductor features.`
                : "Conductor assigned successfully. SMS invite sent.",
            data: {
                userId: savedUser._id,
                profileId: profile._id,
                phone,
                name,
                brand: brand.name,
                isUpgrade: !!exists,
            },
        });
    } catch (error) {
        console.error("assignConductor error:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "This phone number is already assigned.",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/busowner/assignDriver
// Body: { phone, name, brandId, licenseNumber, licenseType, licenseExpiry }
// ─────────────────────────────────────────────────────────────────────────────
const assignDriver = async (req, res) => {
    try {
        const ownerId = req.userInfo?.id;
        const { phone, name, brandId, licenseNumber, licenseType, licenseExpiry } = req.body;

        if (!phone || !name || !brandId || !licenseNumber || !licenseType || !licenseExpiry) {
            return res.status(400).json({
                success: false,
                message: "Phone, name, brandId, licenseNumber, licenseType, and licenseExpiry are required.",
            });
        }

        // Verify brand ownership
        const brand = await verifyBrandOwnership(ownerId, brandId);
        if (!brand) {
            return res.status(403).json({
                success: false,
                message: "You do not own this brand.",
            });
        }

        // Role-aware phone check — only block if already a driver
        const { exists, hasRole, user: existingUser } = await checkPhoneForRole(phone, "driver");

        if (exists && hasRole) {
            return res.status(409).json({
                success: false,
                message: "This phone number is already registered as a driver.",
                errorCode: "ROLE_ALREADY_REGISTERED",
            });
        }

        let savedUser;

        if (exists && existingUser) {
            // === UPGRADE PATH: Add driver role to existing user ===
            savedUser = await User.findByIdAndUpdate(
                existingUser._id,
                {
                    $addToSet: { roles: "driver" },
                    $set: { [`roleActivatedAt.driver`]: new Date() },
                },
                { new: true }
            );
        } else {
            // === NEW USER PATH ===
            const tempPassword = generateTempPassword();
            const hashedPassword = await bcrypt.hash(tempPassword, 12);

            const newUser = new User({
                name,
                phone,
                password: hashedPassword,
                role: "driver",
                roles: ["driver"],
                status: "invited",
                forcePasswordChange: true,
                phoneVerified: false,
                roleActivatedAt: { driver: new Date() },
            });
            savedUser = await newUser.save();

            // SMS invite with temp password (only for new users)
            try {
                await sendSMS(
                    phone,
                    `You've been assigned as driver on Sumarg (${brand.name}). Login with Phone: ${phone} | Temp Password: ${tempPassword} — Change your password on first login.`
                );
            } catch (smsErr) {
                console.warn("[assignDriver] SMS failed (non-fatal):", smsErr.message);
            }
        }

        // Create DriverProfile (if not already exists for this brand)
        let profile = await DriverProfile.findOne({ userId: savedUser._id, brandId });
        if (!profile) {
            profile = new DriverProfile({
                brandId,
                ownerId,
                userId: savedUser._id,
                fullName: name,
                phone,
                licenseNumber,
                licenseType,
                licenseExpiry: new Date(licenseExpiry),
                createdBy: "OPERATOR",
                approvalStatus: "PENDING",
            });
            await profile.save();
        }

        return res.status(201).json({
            success: true,
            message: exists
                ? `Driver role added to existing user (${existingUser.name}). They can now access driver features.`
                : "Driver assigned successfully. SMS invite sent.",
            data: {
                userId: savedUser._id,
                profileId: profile._id,
                phone,
                name,
                brand: brand.name,
                isUpgrade: !!exists,
            },
        });
    } catch (error) {
        console.error("assignDriver error:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "This phone number is already assigned.",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/busowner/removeConductor
// Body: { conductorUserId }
// ─────────────────────────────────────────────────────────────────────────────
const removeConductor = async (req, res) => {
    try {
        const ownerId = req.userInfo?.id;
        const { conductorUserId } = req.body;

        if (!conductorUserId) {
            return res.status(400).json({
                success: false,
                message: "conductorUserId is required.",
            });
        }

        // Verify the conductor belongs to this owner
        const profile = await ConductorProfile.findOne({
            userId: conductorUserId,
            ownerId,
        });

        if (!profile) {
            return res.status(404).json({
                success: false,
                message: "Conductor not found or you don't have permission to remove them.",
            });
        }

        // Deactivate User account
        await User.findByIdAndUpdate(conductorUserId, {
            status: "inactive",
        });

        // Deactivate conductor profile
        profile.status = "INACTIVE";
        await profile.save();

        // Revoke all sessions
        await revokeAllUserTokens(conductorUserId);

        return res.status(200).json({
            success: true,
            message: "Conductor removed successfully. All sessions revoked.",
        });
    } catch (error) {
        console.error("removeConductor error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/busowner/removeDriver
// Body: { driverUserId }
// ─────────────────────────────────────────────────────────────────────────────
const removeDriver = async (req, res) => {
    try {
        const ownerId = req.userInfo?.id;
        const { driverUserId } = req.body;

        if (!driverUserId) {
            return res.status(400).json({
                success: false,
                message: "driverUserId is required.",
            });
        }

        // Verify the driver belongs to this owner
        const profile = await DriverProfile.findOne({
            userId: driverUserId,
            ownerId,
        });

        if (!profile) {
            return res.status(404).json({
                success: false,
                message: "Driver not found or you don't have permission to remove them.",
            });
        }

        // Deactivate User account
        await User.findByIdAndUpdate(driverUserId, {
            status: "inactive",
        });

        // Deactivate driver profile
        profile.status = "INACTIVE";
        await profile.save();

        // Revoke all sessions
        await revokeAllUserTokens(driverUserId);

        return res.status(200).json({
            success: true,
            message: "Driver removed successfully. All sessions revoked.",
        });
    } catch (error) {
        console.error("removeDriver error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

module.exports = {
    assignConductor,
    assignDriver,
    removeConductor,
    removeDriver,
};
