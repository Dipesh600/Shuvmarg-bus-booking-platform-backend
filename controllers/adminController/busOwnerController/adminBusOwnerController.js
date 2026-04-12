const mongoose = require("mongoose");
const User = require("../../../models/userModel.js");
const BusOwner = require("../../../models/busOwnerModel.js");
const UserDeviceInfo = require("../../../models/userDeviceInfoModel.js");
const emailManager = require("../../../emailManager/emailManager.js");
const sendOTP = require("../../../handlers/sparro-otp.js");
const {
    notificationManager,
    createLocalNotification,
} = require("../../notificationController/notification_manager.js");
const generateBusOwnerStatusEmail = require("../../../handlers/busOwnerStatusEmailTemp.js");
const Fleet = require("../../../models/fleetModel.js");


// Get all bus owners api/admin/getAllBusOwners
const getAllBusOwners = async (req, res) => {
    try {
        const busOwners = await User.find({ role: "busOwner" }).select(
            "-password -__v -otp -otpExpiry"
        );

        if (!busOwners || busOwners.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No bus owners found!",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Bus owners retrieved successfully!",
            data: busOwners,
        });
    } catch (error) {
        console.error("getAllBusOwners error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error!",
        });
    }
};

// Admin update bus owner KYC api/admin/busOwnerKycStatus
const updateBusOwnerKyc = async (req, res) => {
    try {
        const {
            id,
            companyRegistration,
            taxRegistration,
            transportLicense,
            insuranceCertificates,
            verificationStatus,
            rejectionReason,
        } = req.body;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Id is required!",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid id format!",
            });
        }

        // id can be either userId or busOwnerKycId
        let busOwner = await BusOwner.findOne({ user: id });
        if (!busOwner) {
            busOwner = await BusOwner.findById(id);
        }

        if (!busOwner) {
            return res.status(404).json({
                success: false,
                message: "Bus owner KYC not found!",
            });
        }

        // Update per-document fields
        if (companyRegistration) {
            busOwner.companyRegistration = busOwner.companyRegistration || {};
            if (typeof companyRegistration.verified === "boolean") {
                busOwner.companyRegistration.verified = companyRegistration.verified;
            }
            if (typeof companyRegistration.rejectionReason === "string") {
                busOwner.companyRegistration.rejectionReason = companyRegistration.rejectionReason;
            }
        }

        if (taxRegistration) {
            busOwner.taxRegistration = busOwner.taxRegistration || {};
            if (typeof taxRegistration.verified === "boolean") {
                busOwner.taxRegistration.verified = taxRegistration.verified;
            }
            if (typeof taxRegistration.rejectionReason === "string") {
                busOwner.taxRegistration.rejectionReason = taxRegistration.rejectionReason;
            }
        }

        if (transportLicense) {
            busOwner.transportLicense = busOwner.transportLicense || {};
            if (typeof transportLicense.verified === "boolean") {
                busOwner.transportLicense.verified = transportLicense.verified;
            }
            if (typeof transportLicense.rejectionReason === "string") {
                busOwner.transportLicense.rejectionReason = transportLicense.rejectionReason;
            }
        }

        if (insuranceCertificates && Array.isArray(insuranceCertificates)) {
            busOwner.insuranceCertificates = busOwner.insuranceCertificates || [];
            // Update by index (simple approach). Caller sends array with verified/rejectionReason.
            insuranceCertificates.forEach((cert, idx) => {
                if (!busOwner.insuranceCertificates[idx]) return;
                if (typeof cert.verified === "boolean") {
                    busOwner.insuranceCertificates[idx].verified = cert.verified;
                }
                if (typeof cert.rejectionReason === "string") {
                    busOwner.insuranceCertificates[idx].rejectionReason = cert.rejectionReason;
                }
            });
        }

        if (verificationStatus) {
            busOwner.verificationStatus = verificationStatus;
        }

        if (typeof rejectionReason === "string") {
            busOwner.rejectionReason = rejectionReason;
        }

        // Mark approval metadata when approved/rejected
        if (verificationStatus === "approved" || verificationStatus === "rejected") {
            if (req.adminInfo?.id) {
                busOwner.approvedBy = req.adminInfo.id;
            }
            busOwner.approvedAt = new Date();
        }

        await busOwner.save();

        // Notify user
        const user = await User.findById(busOwner.user).select("name email phone role");

        const invalidDocs = [];
        if (
            busOwner.companyRegistration &&
            (busOwner.companyRegistration.verified === false || busOwner.companyRegistration.rejectionReason)
        ) {
            invalidDocs.push({
                label: "Company Registration",
                reason: busOwner.companyRegistration.rejectionReason || null,
            });
        }

        if (
            busOwner.taxRegistration &&
            (busOwner.taxRegistration.verified === false || busOwner.taxRegistration.rejectionReason)
        ) {
            invalidDocs.push({
                label: "Tax Registration (PAN/VAT)",
                reason: busOwner.taxRegistration.rejectionReason || null,
            });
        }

        if (
            busOwner.transportLicense &&
            (busOwner.transportLicense.verified === false || busOwner.transportLicense.rejectionReason)
        ) {
            invalidDocs.push({
                label: "Transport License",
                reason: busOwner.transportLicense.rejectionReason || null,
            });
        }

        if (Array.isArray(busOwner.insuranceCertificates)) {
            busOwner.insuranceCertificates.forEach((c, index) => {
                if (c && (c.verified === false || c.rejectionReason)) {
                    invalidDocs.push({
                        label: `Insurance Certificate ${index + 1}`,
                        reason: c.rejectionReason || null,
                    });
                }
            });
        }

        const statusText = busOwner.verificationStatus || "pending";

        // Email
        if (user && user.email) {
            const emailHtml = generateBusOwnerStatusEmail(user.name, statusText, invalidDocs);
            await emailManager(user.email, "Bus Owner KYC Update", emailHtml);
        }

        // SMS
        if (user && user.phone) {
            let smsText = `Dear ${user.name || "Bus Owner"}, your KYC status is ${statusText}.`;
            if (invalidDocs.length > 0) {
                const docNames = invalidDocs.map((d) => d.label).join(", ");
                smsText += ` Invalid documents: ${docNames}.`;
            }
            await sendOTP(user.phone, smsText);
        }

        // Push + local
        try {
            const title = "Bus Owner KYC Updated";
            const body =
                invalidDocs.length > 0
                    ? `Status: ${statusText}. Some documents need attention.`
                    : `Status: ${statusText}.`;

            if (busOwner.user) {
                await createLocalNotification(busOwner.user, "BUS_OWNER_KYC_UPDATE", title, body, {
                    verificationStatus: statusText,
                });

                const devices = await UserDeviceInfo.find({ userId: busOwner.user });
                const tokens = devices.map((d) => d.token).filter(Boolean);
                if (tokens.length > 0) {
                    await notificationManager(tokens, title, body);
                }
            }
        } catch (notifyError) {
            console.error("Bus owner KYC notification error:", notifyError);
        }

        return res.status(200).json({
            success: true,
            message: "Bus owner KYC updated successfully!",
        });
    } catch (error) {
        console.error("updateBusOwnerKyc error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error!",
        });
    }
};

// Get single bus owner KYC record by KYC id. api/admin/getBusOwnerKycDetails
const getBusOwnerKycById = async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Id is required!",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid id format!",
            });
        }

        const busOwnerKyc = await BusOwner.findById(id)
            .populate("user", "name email phone role")
            .lean();

        if (!busOwnerKyc) {
            return res.status(404).json({
                success: false,
                message: "Bus owner KYC not found!",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Bus owner KYC details retrieved successfully!",
            data: busOwnerKyc,
        });
    } catch (error) {
        console.error("getBusOwnerKycById error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error!",
        });
    }
};

// Get all bus owner KYC records api/admin/getAllBusOwnerKycs
const getAllBusOwnerKycs = async (req, res) => {
    try {
        const { verificationStatus } = req.query;

        const filter = {};
        if (verificationStatus) {
            filter.verificationStatus = verificationStatus;
        }

        const busOwnerKycs = await BusOwner.find(filter)
            .populate("user", "name email phone role")
            .sort({ createdAt: -1 })
            .lean();

        if (!busOwnerKycs || busOwnerKycs.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No bus owner KYC records found!",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Bus owner KYC records retrieved successfully!",
            data: busOwnerKycs,
        });
    } catch (error) {
        console.error("getAllBusOwnerKycs error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error!",
        });
    }
};

// Get bus owner by Id. api/admin/getBusOwnerDetails
const getBusOwnerById = async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Id is required!",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid id format!",
            });
        }

        let user = await User.findById(id).select("-password -__v -otp -otpExpiry");
        let busOwner = await BusOwner.findOne({ user: id });

        // If not found by user id, try treating id as BusOwner document _id
        if (!busOwner) {
            busOwner = await BusOwner.findById(id);
            if (busOwner && !user) {
                user = await User.findById(busOwner.user).select(
                    "-password -__v -otp -otpExpiry"
                );
            }
        }

        if (!user && !busOwner) {
            return res.status(404).json({
                success: false,
                message: "Bus owner not found!",
            });
        }

        if (user && user.role !== "busOwner") {
            return res.status(400).json({
                success: false,
                message: "User is not a bus owner!",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Bus owner details retrieved successfully!",
            user,
        });
    } catch (error) {
        console.error("getBusOwnerById error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error!",
        });
    }
};

// Get Bus Owner Dashboard Stats
const getBusOwnerDashboard = async (req, res) => {
    try {

        const [
            totalBusOwners,
            verifiedOwners,
            pendingKyc,
            totalFleets,
        ] = await Promise.all([
            BusOwner.countDocuments({}),
            BusOwner.countDocuments({ verificationStatus: "approved" }),
            BusOwner.countDocuments({ verificationStatus: "pending" }),
            Fleet.countDocuments({}),
        ]);

        const verifiedPercentage = totalBusOwners > 0 
            ? ((verifiedOwners / totalBusOwners) * 100).toFixed(0) 
            : 0;

        return res.status(200).json({
            success: true,
            data: {
                totalBusOwners,
                verifiedOwners: `${verifiedOwners} (${verifiedPercentage}% of total)`,
                pendingKyc,
                totalFleets,
            },
        });
    } catch (error) {
        console.error("getBusOwnerDashboard error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch bus owner dashboard stats",
            error: error.message,
        });
    }
};

module.exports = {
    getAllBusOwners,
    getBusOwnerById,
    getAllBusOwnerKycs,
    getBusOwnerKycById,
    updateBusOwnerKyc,
    getBusOwnerDashboard,
};