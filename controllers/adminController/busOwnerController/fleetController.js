const User = require("../../../models/userModel.js");
const BusOwner = require("../../../models/busOwnerModel.js");
const OperatorBrand = require("../../../models/operatorBrandModel.js");
const fleetService = require("../../../services/fleetService.js");

// Create Fleet for Owner by Admin
const createFleetForOwner = async (req, res) => {
    try {
        const { ownerId } = req.body;

        if (!ownerId) {
            return res.status(400).json({
                success: false,
                message: "Please provide ownerId.",
            });
        }

        // Verify owner User exists
        const owner = await User.findById(ownerId);
        if (!owner) {
            return res.status(404).json({
                success: false,
                message: "Bus owner not found.",
            });
        }

        // ── VERIFICATION GUARD ─────────────────────────────────────────
        // Fleets can only be created under a fully KYC-approved bus owner.
        const busOwnerKyc = await BusOwner.findOne({ user: ownerId }).select("verificationStatus").lean();
        if (!busOwnerKyc) {
            return res.status(400).json({
                success: false,
                message: "Bus owner KYC profile not found. Ensure the owner has completed registration.",
            });
        }
        if (busOwnerKyc.verificationStatus !== "approved") {
            return res.status(403).json({
                success: false,
                message: `Fleet creation is blocked. This bus owner's KYC is currently "${busOwnerKyc.verificationStatus}". Approve their KYC first before adding fleets.`,
            });
        }

        const fleetDoc = await fleetService.createFleet(ownerId, req.body, req.files, "ADMIN");

        return res.status(201).json({
            success: true,
            message: "Fleet created successfully by admin!",
            data: fleetDoc,
        });
    } catch (error) {
        console.error("createFleetForOwner error:", error);
        return res.status(error.message.includes("exists") ? 409 : 400).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Get All Fleets for a specific Owner
const getFleetsByOwner = async (req, res) => {
    try {
        const { ownerId } = req.params;
        const { brandId } = req.query;

        if (!ownerId) {
            return res.status(400).json({
                success: false,
                message: "Owner ID is required.",
            });
        }

        const fleets = await fleetService.getFleetsByOwnerId(ownerId, brandId);

        return res.status(200).json({
            success: true,
            message: "Fleets fetched successfully for the owner!",
            results: fleets.length,
            data: fleets,
        });
    } catch (error) {
        console.error("getFleetsByOwner error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

// Get Single Fleet Details (Admin)
const getFleetById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Fleet ID is required.",
            });
        }

        const fleet = await fleetService.getFleetDetails(id, null); // Admins can view any fleet

        return res.status(200).json({
            success: true,
            message: "Fleet fetched successfully!",
            data: fleet,
        });
    } catch (error) {
        console.error("getFleetById error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Update Fleet by Admin
const updateFleetByAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Fleet ID is required.",
            });
        }

        const updatedFleet = await fleetService.updateFleetDetails(id, req.body, req.files, null); // Admins can edit any fleet

        return res.status(200).json({
            success: true,
            message: "Fleet updated successfully by admin!",
            data: updatedFleet,
        });
    } catch (error) {
        console.error("updateFleetByAdmin error:", error);
        const status = error.message.includes("found") ? 404 : (error.message.includes("exists") ? 409 : 400);
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Resubmit a REJECTED fleet for re-review
const resubmitFleetByAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ success: false, message: "Fleet ID is required." });

        // Brand suspension guard — check before attempting resubmit
        const currentFleet = await require("../../../models/fleetModel.js").findById(id).select("brandId").lean();
        if (currentFleet?.brandId) {
            const brand = await OperatorBrand.findById(currentFleet.brandId).select("status brandName").lean();
            if (brand && brand.status === "SUSPENDED") {
                return res.status(403).json({
                    success: false,
                    message: `Cannot resubmit: Brand "${brand.brandName}" is currently suspended. Reinstate the brand first.`,
                });
            }
        }

        const fleet = await fleetService.resubmitFleet(id, null);
        return res.status(200).json({
            success: true,
            message: "Fleet resubmitted for review. It is now PENDING approval.",
            data: fleet,
        });
    } catch (error) {
        console.error("resubmitFleetByAdmin error:", error);
        const status = error.message.includes("found") ? 404 : 400;
        return res.status(status).json({ success: false, message: error.message });
    }
};

// ─── Re-upload a single failed document on a REJECTED fleet ──────────────────
// PATCH /fleet/reupload-doc/:id
// Body (multipart): docSlot (string) + file
// This is the OWNER's action — fixes a specific flagged document so
// they can eventually resubmit without the admin rejecting it again.
const reuploadFleetDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const { docSlot } = req.body;
        const file = req.files?.[docSlot] || req.file;

        if (!id) return res.status(400).json({ success: false, message: "Fleet ID is required." });
        if (!docSlot) return res.status(400).json({ success: false, message: "docSlot is required (e.g. fitnessCert)." });
        if (!file) return res.status(400).json({ success: false, message: `No file provided for slot: ${docSlot}.` });

        const fleet = await fleetService.reuploadFleetDocument(id, docSlot, file, null);
        return res.status(200).json({
            success: true,
            message: `Document '${docSlot}' replaced successfully. Fix any remaining failed documents, then resubmit.`,
            data: fleet,
        });
    } catch (error) {
        console.error("reuploadFleetDocument error:", error);
        const status = error.message.includes("found") ? 404 : 400;
        return res.status(status).json({ success: false, message: error.message });
    }
};

// Delete Fleet by Admin
const deleteFleetByAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Fleet ID is required.",
            });
        }

        await fleetService.removeFleet(id, null); // Admins can delete any fleet

        return res.status(200).json({
            success: true,
            message: "Fleet deleted successfully by admin!",
        });
    } catch (error) {
        console.error("deleteFleetByAdmin error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

module.exports = {
    createFleetForOwner,
    getFleetsByOwner,
    getFleetById,
    updateFleetByAdmin,
    deleteFleetByAdmin,
    resubmitFleetByAdmin,
    reuploadFleetDocument,
};
