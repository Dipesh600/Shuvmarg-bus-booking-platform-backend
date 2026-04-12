const SuperAdmin = require("../../../models/adminModel.js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const speakeasy = require("speakeasy");


const setupTwoFactor = async (req, res) => {
    try {
        const { adminId, email, password } = req.body;

        if ((!adminId && !email) || !password) {
            return res.status(400).json({
                success: false,
                message: !password
                    ? "Password is required!"
                    : "Either adminId or email is required!",
            });
        }

        const query = {};
        if (adminId) query.adminId = adminId;
        if (email) query.email = email.toLowerCase();

        const admin = await SuperAdmin.findOne(query).select("+password +twoFactorSecret");

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found!",
            });
        }

        const isMatch = await bcrypt.compare(password, admin.password);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials!",
            });
        }

        const secret = speakeasy.generateSecret({
            name: "BusBooking Admin",
            length: 20,
        });

        admin.twoFactorSecret = secret.base32;
        admin.twoFactorEnabled = true;
        admin.twoFactorType = "GOOGLE_AUTH";
        await admin.save();

        return res.status(200).json({
            success: true,
            message: "Two-factor authentication enabled. Scan this in Google Authenticator.",
            otpauthUrl: secret.otpauth_url,
            secret: secret.base32,
        });
    } catch (error) {
        console.error("Admin 2FA setup error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};


const login = async (req, res) => {
    try {
        const { adminId, email, password, otp } = req.body;


        if ((!adminId && !email) || !password) {
            return res.status(400).json({
                success: false,
                message: !password
                    ? "Password is required!"
                    : "Either adminId or email is required!",
            });
        }


        const query = {};
        if (adminId) query.adminId = adminId;
        if (email) query.email = email.toLowerCase();


        const admin = await SuperAdmin.findOne(query).select("+password +twoFactorSecret");


        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found!",
            });
        }


        if (admin.accountLocked) {
            return res.status(403).json({
                success: false,
                message: "Account is locked. Please contact support.",
            });
        }


        if (admin.isActive === false) {
            return res.status(403).json({
                success: false,
                message: "Account is inactive.",
            });
        }


        const isMatch = await bcrypt.compare(password, admin.password);


        if (!isMatch) {
            admin.loginAttempts = (admin.loginAttempts || 0) + 1;
            if (admin.loginAttempts >= 5) {
                admin.accountLocked = true;
            }
            await admin.save();


            return res.status(401).json({
                success: false,
                message: "Invalid credentials!",
            });
        }


        // If 2FA with Google Authenticator is enabled, verify the OTP
        if (admin.twoFactorEnabled && admin.twoFactorType === "GOOGLE_AUTH") {
            if (!otp) {
                return res.status(400).json({
                    success: false,
                    message: "OTP is required for two-factor authentication.",
                });
            }


            if (!admin.twoFactorSecret) {
                return res.status(500).json({
                    success: false,
                    message: "Two-factor authentication is not properly configured for this account.",
                });
            }


            const isOtpValid = speakeasy.totp.verify({
                secret: admin.twoFactorSecret,
                encoding: "base32",
                token: otp,
                window: 1,
            });


            if (!isOtpValid) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid OTP.",
                });
            }
        }


        admin.loginAttempts = 0;
        admin.accountLocked = false;
        admin.lastLoginAt = new Date();
        await admin.save();


        const adminWithoutPassword = admin.toObject();
        delete adminWithoutPassword.password;


        const accessToken = jwt.sign(
            {
                id: admin._id,
                adminId: admin.adminId,
                email: admin.email,
                role: admin.role,
            },
            process.env.SECRET_KEY,
            { expiresIn: "30d" }
        );


        return res.status(200).json({
            success: true,
            message: "Admin login successful",
            admin: adminWithoutPassword,
            accessToken,
        });
    } catch (error) {
        console.error("Admin login error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

const getAdminProfile = async (req, res) => {
    try {
        const adminInfo = req.adminInfo;

        if (!adminInfo || !adminInfo.id) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: admin info not found in request",
            });
        }

        const admin = await SuperAdmin.findById(adminInfo.id).select(
            "-password -twoFactorSecret"
        );

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Admin profile fetched successfully",
            data: admin,
        });
    } catch (error) {
        console.error("getAdminProfile error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};


module.exports = { login, setupTwoFactor, getAdminProfile };
