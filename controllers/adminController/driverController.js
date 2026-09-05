const DriverProfile  = require("../../models/driverProfileModel.js");
const OperatorBrand  = require("../../models/operatorBrandModel.js");
const Fleet          = require("../../models/fleetModel.js");
const User           = require("../../models/userModel.js");
const ConductorProfile = require("../../models/conductorProfileModel.js");
const mongoose       = require("mongoose");
const bcrypt         = require("bcryptjs");
const crypto         = require("crypto");
const logger         = require("../../utils/logger.js");
const storage = require("../../services/s3Service");
const { createDriverDocumentService } = require("../../src/modules/admin/driver-management/driver-documents.service");
const { createDriverMutationsController } = require("../../src/modules/admin/driver-management/driver-mutations.controller");
const { createCrewAssignmentService } = require("../../src/modules/bus-owner/crew/crew-assignment.service");
const documents = createDriverDocumentService({ storage, DriverProfile, logger });
const assignmentService = createCrewAssignmentService({ mongoose, User, DriverProfile, ConductorProfile,
    OperatorBrand, logger, driverDocuments: documents, hashPassword: value => bcrypt.hash(value, 12),
    randomPassword: () => crypto.randomBytes(32).toString("base64url"),
    sendSMS: require("../../handlers/sparro-otp") });
const mutations = createDriverMutationsController({ DriverProfile, OperatorBrand, Fleet, documents, assignmentService, logger });
const exposeAccountState = (driver) => {
    const account = driver?.userId;
    return {
        ...driver,
        userId: account?._id?.toString?.() || account?.toString?.() || null,
        accessStatus: driver?.accessStatus,
        invitationDeliveryStatus: driver?.invitationDeliveryStatus,
        phoneVerified: Boolean(account?.phoneVerified),
    };
};

// ─── CREATE DRIVER ────────────────────────────────────────────────────────────

// ─── GET DRIVERS BY BRAND ─────────────────────────────────────────────────────
const getDriversByBrand = async (req, res) => {
    try {
        const { brandId } = req.params;
        const { status, approvalStatus } = req.query;

        const query = { brandId };
        if (status)         query.status         = status;
        if (approvalStatus) query.approvalStatus  = approvalStatus;

        const drivers = await DriverProfile.find(query)
            .populate("userId", "status phoneVerified roles")
            .populate("assignedBusId", "busName busNumber")
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            results: drivers.length,
            data: drivers.map(exposeAccountState),
        });
    } catch (err) {
        console.error("getDriversByBrand error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── GET DRIVER BY ID ─────────────────────────────────────────────────────────
const getDriverById = async (req, res) => {
    try {
        const driver = await DriverProfile.findById(req.params.id)
            .populate("userId", "status phoneVerified roles")
            .populate("brandId",      "brandName")
            .populate("assignedBusId", "busName busNumber")
            .lean();
        if (!driver) return res.status(404).json({ success: false, message: "Driver not found." });
        return res.status(200).json({ success: true, data: exposeAccountState(driver) });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── UPDATE DRIVER ────────────────────────────────────────────────────────────

// ─── APPROVE DRIVER ───────────────────────────────────────────────────────────

// ─── REJECT DRIVER ────────────────────────────────────────────────────────────

// ─── ASSIGN BUS TO DRIVER ─────────────────────────────────────────────────────

// ─── GET ALL DRIVERS (platform-wide admin view) ───────────────────────────────
const getAllDrivers = async (req, res) => {
    try {
        const { page = 1, limit = 30, approvalStatus, status, brandId } = req.query;
        const query = {};
        if (approvalStatus) query.approvalStatus = approvalStatus;
        if (status)         query.status          = status;
        if (brandId)        query.brandId          = brandId;

        const skip = (Number(page) - 1) * Number(limit);
        const [drivers, total] = await Promise.all([
            DriverProfile.find(query)
                .populate("userId", "status phoneVerified roles")
                .populate("brandId",      "brandName")
                .populate("assignedBusId", "busName busNumber")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .lean(),
            DriverProfile.countDocuments(query),
        ]);

        return res.status(200).json({
            success: true,
            results: drivers.length,
            pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
            data: drivers.map(exposeAccountState),
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    ...mutations,
    viewDriverDocument: documents.view,
    getDriversByBrand,
    getDriverById,
    getAllDrivers,
};
