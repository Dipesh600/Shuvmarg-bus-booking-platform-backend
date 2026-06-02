const Bus = require("../models/fleetModel.js");
const BusAmenities = require("../models/busAmenitiesModel.js");
const BoardingPoints = require("../models/boardingPointsModel.js");
const RouteRequest = require("../models/routeRequestModel.js");
const { uploadFileToS3, getPresignedUrl, buildS3Path, deleteFromS3 } = require("./s3Service.js");
const OperatorBrand = require("../models/operatorBrandModel.js");
const BusOwner = require("../models/busOwnerModel.js");

const uploadManyToS3 = async (files, folder) => {
    const fileArray = Array.isArray(files) ? files : [files];
    const objectKeys = [];
    for (const file of fileArray) {
        const objectKey = await uploadFileToS3(file, folder);
        objectKeys.push(objectKey);
    }
    return objectKeys;
};

const createFleet = async (ownerId, fleetData, files, createdBy = "BUS_OWNER") => {
    const {
        busName,
        busNumber,
        busType,
        totalSeats,
        seatConfig: seatConfigRaw,
        amenitiesId,
        amenityIds,           // new: array of individual amenity ObjectIds
        boardingPointId,
        registrationYear,
        status,
        vehicleType,
        insurancePolicyNumber,
        insuranceValidTill,
        fitnessCertValidTill,
        routePermitValidTill,
        corridorId,
        requestOriginCity,
        requestDestinationCity,
        requestViaStops,
        brandId,
    } = fleetData;

    // Validate required fields
    if (!busName || !busNumber || !busType || !totalSeats || !vehicleType) {
        throw new Error("Missing required fleet fields.");
    }

    // ── VERIFICATION GUARD ─────────────────────────────────────────
    // A fleet can only be created under a fully KYC-approved bus owner.
    const busOwnerKyc = await BusOwner.findOne({ user: ownerId }).select("verificationStatus").lean();
    if (!busOwnerKyc) throw new Error("Bus owner KYC profile not found.");
    if (busOwnerKyc.verificationStatus !== "approved") {
        throw new Error(
            `Bus owner KYC is not approved (current status: ${busOwnerKyc.verificationStatus}). ` +
            `Fleets can only be registered after the bus owner's KYC is approved.`
        );
    }

    // Parse seatConfig JSON if sent as a string (multipart/form-data)
    let seatConfig = null;
    if (seatConfigRaw) {
        try {
            seatConfig = typeof seatConfigRaw === "string" ? JSON.parse(seatConfigRaw) : seatConfigRaw;
        } catch (e) {
            throw new Error("Invalid seatConfig JSON.");
        }
    }

    // Bus Number uniqueness check — normalize before checking AND saving
    const normalizedBusNumber = String(busNumber).trim().toUpperCase();
    const existingBus = await Bus.findOne({ busNumber: normalizedBusNumber });
    if (existingBus) {
        throw new Error("Bus number already exists!");
    }

    // Validate amenitiesId if provided (legacy bundle)
    if (amenitiesId) {
        const amenitiesExist = await BusAmenities.findById(amenitiesId);
        if (!amenitiesExist) {
            throw new Error("Invalid amenitiesId provided.");
        }
    }

    // Validate amenityIds array if provided (new: individual catalog items)
    let parsedAmenityIds = [];
    if (amenityIds) {
        try {
            parsedAmenityIds = typeof amenityIds === "string" ? JSON.parse(amenityIds) : amenityIds;
        } catch { parsedAmenityIds = []; }
        if (parsedAmenityIds.length > 0) {
            const found = await BusAmenities.countDocuments({ _id: { $in: parsedAmenityIds } });
            if (found !== parsedAmenityIds.length) {
                throw new Error("One or more amenityIds are invalid.");
            }
        }
    }

    // Validate boardingPointId if provided
    if (boardingPointId) {
        const boardingPointExist = await BoardingPoints.findById(boardingPointId);
        if (!boardingPointExist) {
            throw new Error("Invalid boardingPointId provided.");
        }
    }

    // Determine approval status
    const approvalStatus = "PENDING";
    const approvedAt = null;

    // Handle Route Assignment vs Route Request
    let routeRequestId = null;
    let finalCorridorId = corridorId || null;

    let requestOriginStr = requestOriginCity || null;
    let requestDestinationStr = requestDestinationCity || null;
    let viaStopsParsed = [];

    if (requestOriginStr && requestDestinationStr) {
        try {
            viaStopsParsed = typeof requestViaStops === "string" ? JSON.parse(requestViaStops) : requestViaStops || [];
        } catch { viaStopsParsed = []; }

        const routeReq = new RouteRequest({
            ownerId,
            originCity: requestOriginStr,
            destinationCity: requestDestinationStr,
            viaStops: viaStopsParsed,
            status: "PENDING",
        });
        const savedReq = await routeReq.save();
        routeRequestId = savedReq._id;
    }

    // ── FIX 5: Brand suspension guard ─────────────────────────────────────────
    // Cannot add a fleet to a suspended brand.
    if (brandId) {
        const brand = await OperatorBrand.findById(brandId).select("status brandName").lean();
        if (!brand) throw new Error("Brand not found. Verify brandId is correct.");
        if (brand.status === "SUSPENDED") {
            throw new Error(
                `Brand "${brand.brandName}" is currently suspended. ` +
                `Reinstate the brand before adding new fleets.`
            );
        }
    }

    // ── Save fleet skeleton FIRST to get its fleetId for S3 paths ───────────
    const fleetSkeleton = new Bus({
        ownerId,
        brandId: brandId || null,
        busName,
        busNumber: normalizedBusNumber,  // always store normalized form
        busType,
        totalSeats: Number(totalSeats),
        seatConfig,
        vehicleType,
        registrationYear: registrationYear ? Number(registrationYear) : null,
        amenitiesId: amenitiesId || null,
        amenityIds: parsedAmenityIds,
        boardingPointId: boardingPointId || null,
        corridorId: finalCorridorId,
        routeRequestId,
        fleetImages: [],
        fleetDocuments: {
            fitnessCert: { url: null, validTill: fitnessCertValidTill || null },
            insurance:   { url: null, policyNumber: insurancePolicyNumber || null, validTill: insuranceValidTill || null },
            bluebook:    { url: null },
            routePermit: { url: null, validTill: routePermitValidTill || null },
        },
        status: status || "INACTIVE",
        approvalStatus,
        approvedAt,
        createdBy,
    });
    const savedFleet = await fleetSkeleton.save();
    const fleetIdStr = savedFleet.fleetId || savedFleet._id.toString();

    // ── Build structured S3 path helper (uses brandId, not brandName) ──────────
    const imgPath = buildS3Path({
        type: "fleet_images",
        ownerId: ownerId.toString(),
        brandId: brandId ? brandId.toString() : null,
        fleetId: fleetIdStr,
    });
    const docPath = (docType) => buildS3Path({
        type: "fleet_docs",
        ownerId: ownerId.toString(),
        brandId: brandId ? brandId.toString() : null,
        fleetId: fleetIdStr,
        documentType: docType,
    });

    // ── Upload images + docs with orphan-safe try/catch ─────────────────────
    const uploadedKeys = [];  // track every key so we can clean up on failure
    try {
        // ── Upload images ─────────────────────────────────────────────────────
        const fleetImages = [];
        const imageFields = ["imageFront", "imageBack", "imageSide", "imageInside"];
        for (const field of imageFields) {
            if (files && files[field]) {
                const key = await uploadFileToS3(files[field], imgPath);
                fleetImages.push(key);
                uploadedKeys.push(key);
            }
        }
        if (fleetImages.length === 0 && (files?.fleetImages || files?.busImage)) {
            const rawFiles = files.fleetImages || files.busImage;
            const arr = Array.isArray(rawFiles) ? rawFiles : [rawFiles];
            for (const f of arr) {
                const key = await uploadFileToS3(f, imgPath);
                fleetImages.push(key);
                uploadedKeys.push(key);
            }
        }

        // ── Upload documents ───────────────────────────────────────────────────
        const fleetDocuments = {
            fitnessCert: { url: null, validTill: fitnessCertValidTill || null },
            insurance:   { url: null, policyNumber: insurancePolicyNumber || null, validTill: insuranceValidTill || null },
            bluebook:    { url: null },
            routePermit: { url: null, validTill: routePermitValidTill || null },
        };
        const uploadDoc = async (file, docType, slot) => {
            if (!file) return;
            const key = await uploadFileToS3(file, docPath(docType));
            uploadedKeys.push(key);
            slot.url = key;
        };
        if (files) {
            await uploadDoc(files.fitnessCert, "fitness-cert", fleetDocuments.fitnessCert);
            await uploadDoc(files.insurance,   "insurance",    fleetDocuments.insurance);
            await uploadDoc(files.bluebook,    "bluebook",     fleetDocuments.bluebook);
            await uploadDoc(files.routePermit, "route-permit", fleetDocuments.routePermit);
        }

        // ── Back-fill + final save ───────────────────────────────────────────────────────
        savedFleet.fleetImages    = fleetImages;
        savedFleet.fleetDocuments = fleetDocuments;
        const fleet = await savedFleet.save();

        // Back-link route request to this fleet
        if (routeRequestId) {
            await RouteRequest.findByIdAndUpdate(routeRequestId, { fleetId: fleet._id });
        }

        return fleet;

    } catch (uploadErr) {
        // ── FIX 6: S3 orphan cleanup ──────────────────────────────────────────────
        // If anything fails after S3 uploads, clean up orphaned files and
        // delete the skeleton fleet document to keep the DB clean.
        console.error("[createFleet] Upload/save failed. Cleaning up S3 orphans and skeleton fleet.", uploadErr.message);
        if (uploadedKeys.length > 0) await deleteFromS3(uploadedKeys);
        await Bus.findByIdAndDelete(savedFleet._id).catch(() => {});
        throw uploadErr;  // re-throw so controller returns 400
    }
}; // end createFleet

const mapFleetWithPresignedUrls = async (fleet) => {
    if (!fleet) return null;
    
    // Map fleetImages
    if (fleet.fleetImages && fleet.fleetImages.length > 0) {
        fleet.fleetImages = await Promise.all(
            fleet.fleetImages.map(key => getPresignedUrl(key))
        );
    }

    // Map fleetDocuments
    if (fleet.fleetDocuments) {
        if (fleet.fleetDocuments.fitnessCert?.url) {
            fleet.fleetDocuments.fitnessCert.url = await getPresignedUrl(fleet.fleetDocuments.fitnessCert.url);
        }
        if (fleet.fleetDocuments.insurance?.url) {
            fleet.fleetDocuments.insurance.url = await getPresignedUrl(fleet.fleetDocuments.insurance.url);
        }
        if (fleet.fleetDocuments.bluebook?.url) {
            fleet.fleetDocuments.bluebook.url = await getPresignedUrl(fleet.fleetDocuments.bluebook.url);
        }
        if (fleet.fleetDocuments.routePermit?.url) {
            fleet.fleetDocuments.routePermit.url = await getPresignedUrl(fleet.fleetDocuments.routePermit.url);
        }
    }
    
    return fleet;
};

const getFleetsByOwnerId = async (ownerId, brandId) => {
    const query = { ownerId };
    if (brandId) {
        query.brandId = brandId;
    }
    const fleets = await Bus.find(query)
        .populate("ownerId", "name email phone")
        .populate("amenitiesId")
        .populate("boardingPointId")
        .populate({
            path: "corridorId",
            select: "code originId destinationId status",
            populate: [
                { path: "originId", select: "name code city" },
                { path: "destinationId", select: "name code city" }
            ]
        })
        .populate("routeRequestId")
        .sort({ createdAt: -1 })
        .lean();
    
    return await Promise.all(fleets.map(mapFleetWithPresignedUrls));
};

const getFleetDetails = async (fleetId, ownerId = null) => {
    const query = { _id: fleetId };
    if (ownerId) query.ownerId = ownerId;

    const fleet = await Bus.findOne(query)
        .populate("ownerId", "name email phone")
        .populate("amenitiesId")
        .populate("boardingPointId")
        .populate({
            path: "corridorId",
            select: "code originId destinationId status",
            populate: [
                { path: "originId", select: "name code city" },
                { path: "destinationId", select: "name code city" }
            ]
        })
        .populate("routeRequestId")
        .lean();
    
    if (!fleet) {
        throw new Error("Fleet not found or unauthorized.");
    }
    return await mapFleetWithPresignedUrls(fleet);
};

const updateFleetDetails = async (fleetId, updateData, files, ownerId = null) => {
    const query = { _id: fleetId };
    if (ownerId) query.ownerId = ownerId;

    const fleet = await Bus.findOne(query);
    if (!fleet) {
        throw new Error("Fleet not found or unauthorized.");
    }

    // ── KYC LOCKDOWN: Prevent structural modifications on APPROVED fleets ────
    if (fleet.approvalStatus === "APPROVED") {
        // Prevent changes to critical fields. If they are in the update payload, remove them.
        delete updateData.busNumber;
        delete updateData.vehicleType;
        delete updateData.registrationYear;
        delete updateData.seatConfig;
        delete updateData.totalSeats;
        delete updateData.busType;
        delete updateData.corridorId;
    }

    // Handle new images — structured path using existing fleet context, with orphan cleanup
    if (files?.fleetImages || files?.busImage) {
        const fleetIdStr = fleet.fleetId || fleet._id.toString();
        const imgPath = buildS3Path({
            type: "fleet_images",
            ownerId: fleet.ownerId.toString(),
            brandId: fleet.brandId ? fleet.brandId.toString() : null,
            fleetId: fleetIdStr,
        });
        const rawFiles = files.fleetImages || files.busImage;
        const arr = Array.isArray(rawFiles) ? rawFiles : [rawFiles];
        const newKeys = [];
        try {
            for (const f of arr) {
                const key = await uploadFileToS3(f, imgPath);
                newKeys.push(key);
            }
            
            // ── S3 CLEANUP: Purge old images since this is an override operation
            if (fleet.fleetImages && fleet.fleetImages.length > 0) {
                // Background deletion (fire and forget) so we don't block the UI response
                deleteFromS3(fleet.fleetImages).catch(err => 
                    console.error(`[S3 Orphan Cleanup Failed] Fleet ${fleetIdStr}:`, err)
                );
            }

            // Override the array, do not append
            updateData.fleetImages = newKeys;
        } catch (uploadErr) {
            // Clean up any keys that were uploaded before the failure
            if (newKeys.length > 0) await deleteFromS3(newKeys);
            throw uploadErr;
        }
    }

    // For busNumber, ensure uniqueness if changed
    if (updateData.busNumber) {
        const normalizedBusNumber = String(updateData.busNumber).trim().toUpperCase();
        if (normalizedBusNumber !== fleet.busNumber) {
            const existingBus = await Bus.findOne({ busNumber: normalizedBusNumber });
            if (existingBus) {
                throw new Error("New bus number already exists!");
            }
            updateData.busNumber = normalizedBusNumber;
        }
    }

    // Parse seatConfig JSON if sent as a string (multipart/form-data)
    if (updateData.seatConfig && typeof updateData.seatConfig === "string") {
        try {
            updateData.seatConfig = JSON.parse(updateData.seatConfig);
        } catch (e) {
            delete updateData.seatConfig;
        }
    }

    // ── GUARDRAIL: Block layout modifications if active trips exist ────
    if (updateData.seatConfig) {
        const oldLayoutStr = JSON.stringify(fleet.seatConfig || {});
        const newLayoutStr = JSON.stringify(updateData.seatConfig);
        if (oldLayoutStr !== newLayoutStr) {
            try {
                const Trip = require("../models/tripModel.js");
                const activeTripsCount = await Trip.countDocuments({
                    busId: fleet._id,
                    tripStatus: { $in: ["SCHEDULED", "BOARDING", "DELAYED"] }
                });
                if (activeTripsCount > 0) {
                    throw new Error(`Cannot modify seat layout. This fleet has ${activeTripsCount} active future trip(s) scheduled. Please drain or cancel future trips first.`);
                }
            } catch (err) {
                if (err.message.includes("Cannot modify")) throw err;
                // If Trip model fails to load, fail safely
                console.error("Trip verification failed during layout update:", err);
            }
        }
    }

    // Parse amenityIds JSON if sent as a string (multipart/form-data)
    if (updateData.amenityIds && typeof updateData.amenityIds === "string") {
        try {
            updateData.amenityIds = JSON.parse(updateData.amenityIds);
        } catch (e) {
            delete updateData.amenityIds;
        }
    }

    // Parse documentReviews from JSON string (sent via multipart FormData during KYC rejection)
    if (updateData.documentReviews && typeof updateData.documentReviews === "string") {
        try {
            updateData.documentReviews = JSON.parse(updateData.documentReviews);
        } catch {
            delete updateData.documentReviews; // ignore malformed payload
        }
    }

    const updatedFleet = await Bus.findByIdAndUpdate(
        fleetId,
        { ...updateData },
        { new: true, runValidators: true }
    ).lean();
    return await mapFleetWithPresignedUrls(updatedFleet);
};

const removeFleet = async (fleetId, ownerId = null) => {
    const query = { _id: fleetId };
    if (ownerId) query.ownerId = ownerId;

    const deletedFleet = await Bus.findOneAndDelete(query);
    if (!deletedFleet) {
        throw new Error("Fleet not found or unauthorized.");
    }
    return deletedFleet;
};

/**
 * Resubmit a REJECTED fleet for re-review.
 * Resets approvalStatus → PENDING and clears document review statuses
 * so the admin sees a fresh review slate.
 */
const resubmitFleet = async (fleetId, ownerId = null) => {
    const query = { _id: fleetId };
    if (ownerId) query.ownerId = ownerId;

    const fleet = await Bus.findOne(query);
    if (!fleet) throw new Error("Fleet not found or unauthorized.");

    if (fleet.approvalStatus !== "REJECTED") {
        throw new Error(
            `Only REJECTED fleets can be resubmitted. Current status: ${fleet.approvalStatus}.`
        );
    }

    // Check there are no remaining failed documents that haven't been re-uploaded
    const reviews = fleet.documentReviews || {};
    const stillFailed = Object.entries(reviews).filter(([, v]) => v?.status === "rejected");
    if (stillFailed.length > 0) {
        const names = stillFailed.map(([k]) => k).join(", ");
        throw new Error(
            `Please re-upload the following failed documents before resubmitting: ${names}.`
        );
    }

    fleet.approvalStatus = "PENDING";
    fleet.status = "INACTIVE"; // stays inactive until re-approved
    fleet.rejectionReason = null;
    // Reset all document review statuses to 'pending' for fresh admin review
    fleet.documentReviews = {
        fleetImages: { status: "pending", reason: null },
        fitnessCert: { status: "pending", reason: null },
        insurance:   { status: "pending", reason: null },
        bluebook:    { status: "pending", reason: null },
        routePermit: { status: "pending", reason: null },
    };
    await fleet.save();
    return fleet;
};

/**
 * Re-upload a specific failed document for a REJECTED fleet.
 * The owner can only replace documents that were flagged as 'rejected'.
 * On success, that document's review status is cleared to 'fixed'
 * so the UI can track which failed docs have been addressed.
 */
const VALID_DOC_SLOTS = ["fitnessCert", "insurance", "bluebook", "routePermit", "fleetImages"];

const reuploadFleetDocument = async (fleetId, docSlot, file, ownerId = null) => {
    if (!VALID_DOC_SLOTS.includes(docSlot)) {
        throw new Error(`Invalid document slot: ${docSlot}. Must be one of: ${VALID_DOC_SLOTS.join(", ")}.`);
    }

    const query = { _id: fleetId };
    if (ownerId) query.ownerId = ownerId;

    const fleet = await Bus.findOne(query);
    if (!fleet) throw new Error("Fleet not found or unauthorized.");

    const fleetIdStr = fleet.fleetId || fleet._id.toString();

    // ── Document Renewal Fix ───────────────────────────────────────────────
    // Allow REJECTED fleets (to fix issues) and APPROVED fleets (for renewals).
    if (fleet.approvalStatus !== "REJECTED" && fleet.approvalStatus !== "APPROVED") {
        throw new Error("Documents can only be replaced on REJECTED or APPROVED fleets.");
    }

    // Upload the replacement file to S3
    let newKey;
    if (docSlot === "fleetImages") {
        const imgPath = buildS3Path({
            type: "fleet_images",
            ownerId: fleet.ownerId.toString(),
            brandId: fleet.brandId ? fleet.brandId.toString() : null,
            fleetId: fleetIdStr,
        });
        newKey = await uploadFileToS3(file, imgPath);
        // Replace all fleet images with the new one (owner uploads a fresh batch)
        fleet.fleetImages = [newKey];
    } else {
        const docPath = buildS3Path({
            type: "fleet_docs",
            ownerId: fleet.ownerId.toString(),
            brandId: fleet.brandId ? fleet.brandId.toString() : null,
            fleetId: fleetIdStr,
            documentType: docSlot,
        });
        newKey = await uploadFileToS3(file, docPath);
        fleet.fleetDocuments[docSlot].url = newKey;
    }

    // Mark this document slot as 'fixed' if REJECTED (cleared for resubmission),
    // or 'pending' if APPROVED (renewal awaiting admin review).
    const nextReviewStatus = fleet.approvalStatus === "REJECTED" ? "fixed" : "pending";
    
    if (!fleet.documentReviews) fleet.documentReviews = {};
    fleet.documentReviews[docSlot] = { status: nextReviewStatus, reason: null };
    fleet.markModified("documentReviews");
    fleet.markModified("fleetDocuments");

    await fleet.save();
    return await mapFleetWithPresignedUrls(fleet.toObject());
};

module.exports = {
    createFleet,
    getFleetsByOwnerId,
    getFleetDetails,
    updateFleetDetails,
    removeFleet,
    resubmitFleet,
    reuploadFleetDocument,
};
