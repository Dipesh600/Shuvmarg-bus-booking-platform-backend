const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const BusOwner = require("../../../models/busOwnerModel.js");
const User = require("../../../models/userModel.js");
const Fleet = require("../../../models/fleetModel.js");
const OperatorBrand = require("../../../models/operatorBrandModel.js");
const UserDeviceInfo = require("../../../models/userDeviceInfoModel.js");
const emailManager = require("../../../emailManager/emailManager.js");
const sendOTP = require("../../../handlers/sparro-otp.js");
const generatePassword = require("../../../handlers/passwordGenerator.js");
const emailTemplate = require("../../../handlers/password-email-template.js");
const { uploadFileToS3, getPresignedUrl, buildS3Path } = require("../../../services/s3Service.js");
const {
    notificationManager,
    createLocalNotification,
} = require("../../notificationController/notification_manager.js");
const generateBusOwnerStatusEmail = require("../../../handlers/busOwnerStatusEmailTemp.js");
// Get all bus owners api/admin/getAllBusOwners
const getAllBusOwners = async (req, res) => {
    try {
        // Query the actual BusOwner collection, not just generic users
        const busOwners = await BusOwner.find()
            .populate("user", "-password -__v -otp -otpExpiry")
            .lean();

        const formattedList = busOwners.map(bo => {
            if (!bo.user) return null;
            return {
                _id: bo.user._id,      // The frontend uses the user ID for actions routing
                busOwnerId: bo._id,
                name: bo.user.name,
                email: bo.user.email,
                phone: bo.user.phone,
                profilePicture: bo.user.profilePicture,
                status: bo.user.status, // global active/suspended status
                isVerified: bo.verificationStatus === "approved",
                verificationStatus: bo.verificationStatus,
                companyName: bo.companyName || bo.companyRegistration?.companyName || "N/A",
                createdAt: bo.createdAt
            };
        }).filter(Boolean);

        return res.status(200).json({
            success: true,
            message: formattedList.length === 0 ? "No bus owners registered yet." : "Bus owners retrieved successfully!",
            results: formattedList.length,
            data: formattedList,
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

        // ── FIX 3: Race condition guard ──────────────────────────────────────────
        // If two admins try to finalize the same record simultaneously,
        // the second request will find it already sealed and return 409.
        const sealedStatuses = ["approved", "rejected"];
        if (verificationStatus && sealedStatuses.includes(verificationStatus)
            && sealedStatuses.includes(busOwner.verificationStatus)
            && busOwner.verificationStatus === verificationStatus) {
            return res.status(409).json({
                success: false,
                message: `This KYC application was already ${busOwner.verificationStatus} by another admin. Reload the page to see the latest state.`,
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

        // Handle ownerIdentity verdict
        if (req.body.ownerIdentity) {
            busOwner.ownerIdentity = busOwner.ownerIdentity || {};
            if (typeof req.body.ownerIdentity.verified === "boolean") {
                busOwner.ownerIdentity.verified = req.body.ownerIdentity.verified;
            }
            if (typeof req.body.ownerIdentity.rejectionReason === "string") {
                busOwner.ownerIdentity.rejectionReason = req.body.ownerIdentity.rejectionReason;
            }
        }

        if (verificationStatus) {
            busOwner.verificationStatus = verificationStatus;
        }

        if (typeof rejectionReason === "string") {
            busOwner.rejectionReason = rejectionReason;
        }

        // Mark approval metadata and sync User account status
        const prevVerificationStatus = busOwner.verificationStatus;
        if (verificationStatus === "approved" || verificationStatus === "rejected") {
            if (req.adminInfo?.id) {
                busOwner.approvedBy = req.adminInfo.id;
            }
            busOwner.approvedAt = new Date();

            if (verificationStatus === "approved") {
                await User.findByIdAndUpdate(busOwner.user, { status: "active", isVerified: true });
            } else if (verificationStatus === "rejected") {
                await User.findByIdAndUpdate(busOwner.user, { status: "pending", isVerified: false });
            }
        }

        await busOwner.save();

        // ── FIX 4: Cascade suspension on KYC revocation ───────────────────────────
        // If a previously-approved owner is rejected or reverted to pending,
        // auto-suspend all their brands and deactivate all their fleets.
        if (prevVerificationStatus === "approved" &&
            (verificationStatus === "rejected" || verificationStatus === "pending")) {
            await Promise.all([
                OperatorBrand.updateMany(
                    { ownerId: busOwner.user },
                    { status: "SUSPENDED", suspendedReason: "Bus owner KYC revoked" }
                ),
                Fleet.updateMany(
                    { ownerId: busOwner.user },
                    { status: "INACTIVE", approvalStatus: "PENDING" }
                ),
            ]);
            console.log(`[KYC Cascade] Suspended brands and fleets for owner ${busOwner.user} due to KYC revocation.`);
        }

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

        // Email notification — best-effort, must NOT crash the KYC update response
        if (user && user.email) {
            try {
                const emailHtml = generateBusOwnerStatusEmail(user.name, statusText, invalidDocs);
                await emailManager(user.email, "Bus Owner KYC Update", emailHtml);
            } catch (emailErr) {
                console.warn("[updateBusOwnerKyc] Email notification failed (non-fatal):", emailErr.message);
            }
        }

        // SMS notification — best-effort, must NOT crash the KYC update response
        if (user && user.phone) {
            try {
                let smsText = `Dear ${user.name || "Bus Owner"}, your KYC status is ${statusText}.`;
                if (invalidDocs.length > 0) {
                    const docNames = invalidDocs.map((d) => d.label).join(", ");
                    smsText += ` Invalid documents: ${docNames}.`;
                }
                await sendOTP(user.phone, smsText);
            } catch (smsErr) {
                console.warn("[updateBusOwnerKyc] SMS notification failed (non-fatal):", smsErr.message);
            }
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

        // id can be either userId or the primary busOwnerKycId
        let busOwnerKyc = await BusOwner.findOne({ user: id })
            .populate("user", "name email phone role")
            .lean();

        if (!busOwnerKyc) {
            busOwnerKyc = await BusOwner.findById(id)
                .populate("user", "name email phone role")
                .lean();
        }

        if (!busOwnerKyc) {
            return res.status(404).json({
                success: false,
                message: "Bus owner KYC not found!",
            });
        }

        // Map S3 object keys to presigned URLs for all document sections
        const mapUrls = async (urls) => {
            if (!urls || !Array.isArray(urls)) return [];
            return await Promise.all(urls.map(url => getPresignedUrl(url)));
        };

        if (busOwnerKyc.companyRegistration?.documentUrls) {
            busOwnerKyc.companyRegistration.documentUrls = await mapUrls(busOwnerKyc.companyRegistration.documentUrls);
        }
        if (busOwnerKyc.ownerIdentity?.documentUrls) {
            busOwnerKyc.ownerIdentity.documentUrls = await mapUrls(busOwnerKyc.ownerIdentity.documentUrls);
        }
        if (busOwnerKyc.taxRegistration?.documentUrls) {
            busOwnerKyc.taxRegistration.documentUrls = await mapUrls(busOwnerKyc.taxRegistration.documentUrls);
        }
        if (busOwnerKyc.bankDetails?.documentUrls) {
            busOwnerKyc.bankDetails.documentUrls = await mapUrls(busOwnerKyc.bankDetails.documentUrls);
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

        return res.status(200).json({
            success: true,
            message: busOwnerKycs.length === 0 ? "No KYC records found." : "Bus owner KYC records retrieved successfully!",
            results: busOwnerKycs.length,
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

        // Aggregate additional data for the profile overview
        const fleets = await Fleet.find({ busOwnerId: busOwner ? busOwner._id : null }).populate("operatorId", "name email");
        const activeRoutes = [...new Set(fleets.map(f => f.route?.from + '-' + f.route?.to).filter(Boolean))].length;

        // Note: For revenue and settlements, placeholder for now as per original mock/DB state
        const formattedUserVal = {
            ...user.toObject(),
            busOwnerDoc: busOwner || null,
            fleetSize: fleets.length,
            activeRoutes,
            buses: fleets.map(f => ({
                id: f.busNumber,
                type: f.busType,
                route: f.route ? `${f.route.from} - ${f.route.to}` : "Unassigned",
                status: f.status,
                capacity: f.totalSeats || 0
            })),
            monthlyRevenue: "NPR 0", // Replace with Transaction agg when building financial module
            totalRevenue: "NPR 0",
            recentPayments: []
        };

        return res.status(200).json({
            success: true,
            message: "Bus owner details retrieved successfully!",
            user: formattedUserVal,
        });
    } catch (error) {
        console.error("getBusOwnerById error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error!",
        });
    }
};

// Create bus owner (3-step wizard) api/admin/busOwner/create
const createBusOwnerFull = async (req, res) => {
    try {
        const {
            companyName, ownerName, phone, email, panNumber, registrationNumber, address,
            bankName, accountHolderName, accountNumber, branchName, swiftCode, ownerNotes
        } = req.body;

        if (!companyName || !ownerName || !phone || !address || !bankName || !accountHolderName || !accountNumber || !branchName) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields for Company or Bank details.",
            });
        }

        const userEmail = email && email.trim() !== "" ? email.toLowerCase() : null;

        const query = { $or: [{ phone }] };
        if (userEmail) {
            query.$or.push({ email: userEmail });
        }
        const existingUser = await User.findOne(query);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Email or phone number already registered!",
            });
        }

        // Upload documents if provided
        const files = req.files || {};

        // STRICT KYC VALIDATION
        if (!files.companyRegistrationCert || !files.panCardImage || !files.ownerCitizenship) {
            return res.status(400).json({
                success: false,
                message: "Mandatory KYC documents (Company Registration, PAN Card, Citizenship) are missing from the upload.",
            });
        }

        // Create User first (needed for busOwner reference)
        const newPassword = generatePassword(8);
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        const newUserData = {
            name: ownerName,
            phone,
            address,
            password: hashedPassword,
            gender: "male",
            role: "busOwner",
            status: "active",               // Admin-onboarded = already approved
            forcePasswordChange: true,       // Must change temp password on first login
        };
        // Only add email if actually provided — sparse index skips absent fields,
        // but if we pass email: null the index treats it as a real value and collides.
        if (userEmail) newUserData.email = userEmail;

        const newUser = new User(newUserData);
        const savedUser = await newUser.save();

        // Send temp credentials via SMS
        try {
            await sendOTP(phone, `Welcome to Sumarg! Your bus owner login: Phone: ${phone} | Temp Password: ${newPassword} — Please change your password on first login.`);
        } catch (smsErr) {
            console.warn("[createBusOwnerFull] SMS notification failed (non-fatal):", smsErr.message);
        }

        if (email && email.trim() !== "") {
            const emailContent = emailTemplate(newPassword, ownerName);
            await emailManager(userEmail, "Auto Generated Password", emailContent).catch(e => console.log("Email error", e));
        }

        // Create BusOwner skeleton first to get its _id for structured S3 paths
        const newBusOwner = new BusOwner({
            user: savedUser._id,
            companyName,
            companyRegistration: { documentUrls: [], verified: false },
            ownerIdentity:       { documentUrls: [], verified: false },
            taxRegistration:     { panNumber: panNumber || null, registrationNumber: registrationNumber || null, documentUrls: [], verified: false },
            bankDetails:         { bankName, accountNumber, accountHolderName, branchName, swiftCode: swiftCode || null, documentUrls: [] },
            verificationStatus: "pending",
        });
        const savedBusOwner = await newBusOwner.save();

        // Now upload documents with structured paths anchored to the real busOwnerId
        const ownerKycPath = (docType) => buildS3Path({
            type: "owner_kyc",
            ownerId: savedBusOwner._id.toString(),
            documentType: docType,
        });

        const companyRegUrl = await uploadFileToS3(files.companyRegistrationCert, ownerKycPath("company-registration"));
        const panCardUrl    = await uploadFileToS3(files.panCardImage,            ownerKycPath("tax-registration"));
        const citizenshipUrl = await uploadFileToS3(files.ownerCitizenship,       ownerKycPath("owner-identity"));
        const bankLetterUrl  = files.bankAuthorizationLetter
            ? await uploadFileToS3(files.bankAuthorizationLetter, ownerKycPath("bank-details"))
            : null;

        // Back-fill document URLs now that we have real S3 keys
        if (companyRegUrl) savedBusOwner.companyRegistration.documentUrls = [companyRegUrl];
        if (citizenshipUrl) savedBusOwner.ownerIdentity.documentUrls = [citizenshipUrl];
        if (panCardUrl) savedBusOwner.taxRegistration.documentUrls = [panCardUrl];
        if (bankLetterUrl) savedBusOwner.bankDetails.documentUrls = [bankLetterUrl];
        await savedBusOwner.save();

        return res.status(201).json({
            success: true,
            message: "Bus Owner registered successfully with PENDING KYC status.",
            busOwnerId: savedBusOwner.busOwnerId,
            userId: savedUser._id,
        });
    } catch (error) {
        console.error("createBusOwnerFull error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error!",  // expose actual error for debugging
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

// Reupload specific KYC document API api/admin/busOwner/reuploadKycDocument
const reuploadKycDocument = async (req, res) => {
    try {
        const { id, documentType } = req.body;
        
        if (!id || !documentType) {
            return res.status(400).json({
                success: false,
                message: "Bus Owner ID and Document Type are required."
            });
        }

        const validDocumentTypes = ["companyRegistration", "ownerIdentity", "taxRegistration", "bankDetails"];
        if (!validDocumentTypes.includes(documentType)) {
            return res.status(400).json({
                success: false,
                message: "Invalid document type."
            });
        }

        const files = req.files || {};
        const documentFile = files.document;

        if (!documentFile) {
            return res.status(400).json({
                success: false,
                message: "No document file provided for re-upload."
            });
        }

        let busOwner = await BusOwner.findById(id);
        if (!busOwner) {
            return res.status(404).json({
                success: false,
                message: "Bus owner KYC record not found."
            });
        }

        // Upload the new file to S3 — use structured path anchored to busOwner._id
        const documentUrl = await uploadFileToS3(
            documentFile,
            buildS3Path({
                type: "owner_kyc",
                ownerId: busOwner._id.toString(),
                documentType: documentType,
            })
        );
        if (!documentUrl) {
            return res.status(500).json({
                success: false,
                message: "Failed to upload document to storage."
            });
        }

        // Update the specific document section
        if (!busOwner[documentType]) {
            busOwner[documentType] = {};
        }
        
        busOwner[documentType].documentUrls = [documentUrl]; // Replace existing with new upload
        busOwner[documentType].verified = false; // Reset verified status to false (pending)
        busOwner[documentType].rejectionReason = null; // Clear old rejection reason

        // Reset the overall verification status back to pending so it reappears in review queue
        busOwner.verificationStatus = "pending";
        
        await busOwner.save();

        return res.status(200).json({
            success: true,
            message: `${documentType} re-uploaded successfully. KYC status is now pending review.`,
            data: busOwner
        });

    } catch (error) {
        console.error("reuploadKycDocument error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message
        });
    }
};

// Update Bus Owner Profile (General details)
const updateBusOwnerProfile = async (req, res) => {
    try {
        const { 
            id, // BusOwner._id
            name, 
            email, 
            phone, 
            address, 
            companyName,
            panNumber,
            registrationNumber,
            bankName,
            accountNumber,
            accountHolderName,
            branchName,
            swiftCode
        } = req.body;

        if (!id) {
            return res.status(400).json({ success: false, message: "Bus Owner ID is required." });
        }

        const busOwner = await BusOwner.findById(id);
        if (!busOwner) {
            return res.status(404).json({ success: false, message: "Bus Owner record not found." });
        }

        const user = await User.findById(busOwner.user);
        if (!user) {
            return res.status(404).json({ success: false, message: "Linked user account not found." });
        }

        // Update User details
        if (name) user.name = name;
        if (address) user.address = address;
        
        // Handle sensitive unique fields with checks
        if (email !== undefined) {
            const newEmail = email && email.trim() !== "" ? email.toLowerCase() : null;
            const currentEmail = user.email ? user.email.toLowerCase() : null;

            if (newEmail !== currentEmail) {
                if (newEmail) {
                    const existing = await User.findOne({ email: newEmail });
                    if (existing) return res.status(400).json({ success: false, message: "Email already in use." });
                }
                user.email = newEmail;
            }
        }
        if (phone && phone !== user.phone) {
            const existing = await User.findOne({ phone });
            if (existing) return res.status(400).json({ success: false, message: "Phone number already in use." });
            user.phone = phone;
        }

        // Update BusOwner details
        if (companyName) busOwner.companyName = companyName;
        
        // Update Tax Registration
        if (!busOwner.taxRegistration) busOwner.taxRegistration = {};
        if (panNumber !== undefined) busOwner.taxRegistration.panNumber = panNumber;
        if (registrationNumber !== undefined) busOwner.taxRegistration.registrationNumber = registrationNumber;

        // Update Bank Details
        if (!busOwner.bankDetails) busOwner.bankDetails = {};
        if (bankName !== undefined) busOwner.bankDetails.bankName = bankName;
        if (accountNumber !== undefined) busOwner.bankDetails.accountNumber = accountNumber;
        if (accountHolderName !== undefined) busOwner.bankDetails.accountHolderName = accountHolderName;
        if (branchName !== undefined) busOwner.bankDetails.branchName = branchName;
        if (swiftCode !== undefined) busOwner.bankDetails.swiftCode = swiftCode;

        await Promise.all([user.save(), busOwner.save()]);

        return res.status(200).json({
            success: true,
            message: "Bus Owner profile updated successfully.",
            data: { user, busOwner }
        });

    } catch (error) {
        console.error("updateBusOwnerProfile error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message
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
    createBusOwnerFull,
    reuploadKycDocument,
    updateBusOwnerProfile,
};