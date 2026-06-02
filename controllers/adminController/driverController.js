const DriverProfile  = require("../../models/driverProfileModel.js");
const OperatorBrand  = require("../../models/operatorBrandModel.js");
const Fleet          = require("../../models/fleetModel.js");
const logger         = require("../../utils/logger.js");
const { uploadFileToS3, buildS3Path } = require("../../services/s3Service.js");

// Helper: upload a single driver document file to S3.
// Returns the S3 object key (not a URL — presigned URLs are generated at read time).
const uploadDriverDoc = async (file, brandId, driverId, docType) => {
    if (!file) return null;
    const path = buildS3Path({
        type:     "driver_docs",
        brandId:  brandId.toString(),
        driverId: driverId.toString(),
        documentType: docType,
    });
    return await uploadFileToS3(file, path);
};

// ─── CREATE DRIVER ────────────────────────────────────────────────────────────
const createDriver = async (req, res) => {
    try {
        const {
            brandId, fullName, phone, email, gender, address,
            licenseNumber, licenseType, licenseExpiry,
            medicalCertExpiry, experienceYears, previousEmployer, notes,
        } = req.body;

        if (!brandId || !fullName || !phone || !licenseNumber || !licenseType || !licenseExpiry) {
            return res.status(400).json({
                success: false,
                message: "brandId, fullName, phone, licenseNumber, licenseType, and licenseExpiry are required.",
            });
        }

        const brand = await OperatorBrand.findById(brandId).select("ownerId status brandName").lean();
        if (!brand) return res.status(404).json({ success: false, message: "Brand not found." });
        if (brand.status !== "ACTIVE") {
            return res.status(403).json({ success: false, message: `Brand is ${brand.status}. Only ACTIVE brands can add drivers.` });
        }

        // Create the driver record first to get a driverId for the S3 path
        const driver = await DriverProfile.create({
            brandId,
            ownerId:          brand.ownerId,
            fullName:         fullName.trim(),
            phone:            phone.trim(),
            email:            email?.trim() || null,
            gender:           gender || null,
            address:          address || null,
            licenseNumber:    licenseNumber.toUpperCase().trim(),
            licenseType,
            licenseExpiry:    new Date(licenseExpiry),
            medicalCertExpiry: medicalCertExpiry ? new Date(medicalCertExpiry) : null,
            experienceYears:  experienceYears || 0,
            previousEmployer: previousEmployer || null,
            notes:            notes || null,
            approvalStatus: "PENDING",
            createdBy:      "ADMIN",
        });

        // Upload documents to S3 now that we have a driverId
        // S3 path: drivers/{brandId}/{driverId}/{docType}/filename
        const licenseDocKey     = await uploadDriverDoc(req.files?.licenseDoc,     brandId, driver._id, "license");
        const medicalCertDocKey = await uploadDriverDoc(req.files?.medicalCertDoc, brandId, driver._id, "medical-cert");
        const photoKey          = await uploadDriverDoc(req.files?.photo,          brandId, driver._id, "photo");

        // Back-fill the uploaded keys onto the driver record
        driver.photo       = photoKey;
        driver.licenseDoc  = licenseDocKey;
        driver.medicalCertDoc = medicalCertDocKey;
        driver.documents   = {
            license: { url: licenseDocKey,     validTill: licenseExpiry     ? new Date(licenseExpiry)     : null },
            medical: { url: medicalCertDocKey,  validTill: medicalCertExpiry ? new Date(medicalCertExpiry) : null },
        };
        await driver.save();

        return res.status(201).json({
            success: true,
            message: "Driver created. Pending admin document review.",
            data: driver,
        });
    } catch (err) {
        console.error("createDriver error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── GET DRIVERS BY BRAND ─────────────────────────────────────────────────────
const getDriversByBrand = async (req, res) => {
    try {
        const { brandId } = req.params;
        const { status, approvalStatus } = req.query;

        const query = { brandId };
        if (status)         query.status         = status;
        if (approvalStatus) query.approvalStatus  = approvalStatus;

        const drivers = await DriverProfile.find(query)
            .populate("assignedBusId", "busName busNumber")
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            results: drivers.length,
            data: drivers,
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
            .populate("brandId",      "brandName")
            .populate("assignedBusId", "busName busNumber")
            .lean();
        if (!driver) return res.status(404).json({ success: false, message: "Driver not found." });
        return res.status(200).json({ success: true, data: driver });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── UPDATE DRIVER ────────────────────────────────────────────────────────────
const updateDriver = async (req, res) => {
    try {
        const allowed = [
            "fullName", "phone", "email", "gender", "address",
            "licenseNumber", "licenseType", "licenseExpiry",
            "medicalCertExpiry", "experienceYears",
            "previousEmployer", "notes", "status",
        ];
        const update = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) update[key] = req.body[key];
        }

        // Find the driver first to get brandId for the S3 path
        const existing = await DriverProfile.findById(req.params.id).select("brandId").lean();
        if (!existing) return res.status(404).json({ success: false, message: "Driver not found." });

        // Handle file re-uploads — replace document if a new file is provided
        if (req.files?.licenseDoc) {
            const key = await uploadDriverDoc(req.files.licenseDoc, existing.brandId, existing._id, "license");
            update.licenseDoc = key;
            if (!update["documents.license"]) update["documents.license"] = {};
            update["documents.license"].url = key;
        }
        if (req.files?.medicalCertDoc) {
            const key = await uploadDriverDoc(req.files.medicalCertDoc, existing.brandId, existing._id, "medical-cert");
            update.medicalCertDoc = key;
            if (!update["documents.medical"]) update["documents.medical"] = {};
            update["documents.medical"].url = key;
        }
        if (req.files?.photo) {
            update.photo = await uploadDriverDoc(req.files.photo, existing.brandId, existing._id, "photo");
        }

        const driver = await DriverProfile.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!driver) return res.status(404).json({ success: false, message: "Driver not found." });

        return res.status(200).json({ success: true, message: "Driver updated.", data: driver });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── APPROVE DRIVER ───────────────────────────────────────────────────────────
const approveDriver = async (req, res) => {
    try {
        const driver = await DriverProfile.findById(req.params.id);
        if (!driver) return res.status(404).json({ success: false, message: "Driver not found." });

        if (driver.approvalStatus === "APPROVED") {
            return res.status(400).json({ success: false, message: "Driver is already APPROVED." });
        }

        // Compliance check — license must not be expired
        if (driver.licenseExpiry && new Date(driver.licenseExpiry) < new Date()) {
            return res.status(400).json({
                success: false,
                message: "Cannot approve: driver's license is expired. Upload a valid license first.",
            });
        }

        driver.approvalStatus = "APPROVED";
        driver.status         = "AVAILABLE";
        driver.approvedAt     = new Date();
        // driver.approvedBy  = req.admin?._id;
        driver.rejectionReason = null;
        await driver.save();

        logger.info("driverController: driver approved", { driverId: driver._id, brandId: driver.brandId });

        return res.status(200).json({
            success: true,
            message: "Driver approved. They can now be assigned to schedules.",
            data: driver,
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── REJECT DRIVER ────────────────────────────────────────────────────────────
const rejectDriver = async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ success: false, message: "Rejection reason is required." });

        const driver = await DriverProfile.findById(req.params.id);
        if (!driver) return res.status(404).json({ success: false, message: "Driver not found." });

        driver.approvalStatus  = "REJECTED";
        driver.status          = "INACTIVE";
        driver.rejectionReason = reason;
        driver.rejectedAt      = new Date();
        await driver.save();

        return res.status(200).json({ success: true, message: "Driver rejected.", data: driver });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── ASSIGN BUS TO DRIVER ─────────────────────────────────────────────────────
const assignBusToDriver = async (req, res) => {
    try {
        const { busId } = req.body;
        if (!busId) return res.status(400).json({ success: false, message: "busId is required." });

        const fleet = await Fleet.findById(busId).select("busName busNumber approvalStatus brandId").lean();
        if (!fleet) return res.status(404).json({ success: false, message: "Fleet not found." });
        if (fleet.approvalStatus !== "APPROVED") {
            return res.status(400).json({ success: false, message: "Can only assign driver to an APPROVED bus." });
        }

        const driver = await DriverProfile.findById(req.params.id);
        if (!driver) return res.status(404).json({ success: false, message: "Driver not found." });
        if (driver.approvalStatus !== "APPROVED") {
            return res.status(400).json({ success: false, message: "Driver must be APPROVED before assigning to a bus." });
        }
        if (fleet.brandId?.toString() !== driver.brandId.toString()) {
            return res.status(403).json({ success: false, message: "Bus and driver must belong to the same brand." });
        }

        driver.assignedBusId = busId;
        await driver.save();

        return res.status(200).json({
            success: true,
            message: `Driver assigned to ${fleet.busName} (${fleet.busNumber}).`,
            data: driver,
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

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
            data: drivers,
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    createDriver,
    getDriversByBrand,
    getDriverById,
    updateDriver,
    approveDriver,
    rejectDriver,
    assignBusToDriver,
    getAllDrivers,
};
