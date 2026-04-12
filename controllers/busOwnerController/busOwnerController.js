const cloudinary = require("../../handlers/cloudinary.js");
const BusOwner = require("../../models/busOwnerModel.js");
const Bus = require("../../models/fleetModel.js");
const BoardingPoints = require("../../models/boardingPointsModel.js");
const BusAmenities = require("../../models/busAmenitiesModel.js");
const fleetService = require("../../services/fleetService.js");
const boardingPointService = require("../../services/boardingPointService.js");
const amenityService = require("../../services/amenityService.js");

const uploadToCloudinary = async (file, folder) => {
    const base64 = `data:${file.mimetype};base64,${file.data.toString("base64")}`;
    const result = await cloudinary.uploader.upload(base64, {
        folder,
        overwrite: true,
    });
    return result.secure_url;
};

const uploadManyToCloudinary = async (files, folder) => {
    const fileArray = Array.isArray(files) ? files : [files];
    const urls = [];
    for (const file of fileArray) {
        const url = await uploadToCloudinary(file, folder);
        urls.push(url);
    }
    return urls;
};

const submitBusOwnerKyc = async (req, res) => {
    try {
        const userId = req.userInfo?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        let busOwner = await BusOwner.findOne({ user: userId });

        if (!busOwner) {
            busOwner = new BusOwner({ user: userId });
        }

        const files = req.files || {};

        if (files.companyRegistration) {
            const urls = await uploadManyToCloudinary(
                files.companyRegistration,
                "bus_owner_kyc/company_registration"
            );
            busOwner.companyRegistration = busOwner.companyRegistration || {};
            busOwner.companyRegistration.documentUrls = urls;
            busOwner.companyRegistration.verified = false;
            busOwner.companyRegistration.rejectionReason = null;
        }

        if (files.taxRegistration) {
            const urls = await uploadManyToCloudinary(
                files.taxRegistration,
                "bus_owner_kyc/tax_registration"
            );
            busOwner.taxRegistration = busOwner.taxRegistration || {};
            busOwner.taxRegistration.documentUrls = urls;
            busOwner.taxRegistration.verified = false;
            busOwner.taxRegistration.rejectionReason = null;
        }

        if (files.transportLicense) {
            const urls = await uploadManyToCloudinary(
                files.transportLicense,
                "bus_owner_kyc/transport_license"
            );
            busOwner.transportLicense = busOwner.transportLicense || {};
            busOwner.transportLicense.documentUrls = urls;
            busOwner.transportLicense.verified = false;
            busOwner.transportLicense.rejectionReason = null;
        }

        if (files.insuranceCertificates) {
            const urls = await uploadManyToCloudinary(
                files.insuranceCertificates,
                "bus_owner_kyc/insurance"
            );

            busOwner.insuranceCertificates = urls.map((url) => ({
                insurerName: null,
                policyNumber: null,
                validTill: null,
                documentUrls: [url],
                verified: false,
                rejectionReason: null,
            }));
        }

        // Reset overall verification status when KYC is (re)submitted
        busOwner.verificationStatus = "pending";
        busOwner.rejectionReason = null;

        await busOwner.save();

        return res.status(200).json({
            success: true,
            message: "Bus owner KYC submitted successfully",
        });
    } catch (error) {
        console.error("submitBusOwnerKyc error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

const getMyBusOwnerKycStatus = async (req, res) => {
    try {
        const userId = req.userInfo?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        const busOwner = await BusOwner.findOne({ user: userId }).lean();

        if (!busOwner) {
            return res.status(404).json({
                success: false,
                message: "Bus owner KYC not found. Please submit your KYC.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Bus owner KYC status fetched successfully",
            data: {
                verificationStatus: busOwner.verificationStatus,
                rejectionReason: busOwner.rejectionReason,
                companyRegistration: busOwner.companyRegistration,
                taxRegistration: busOwner.taxRegistration,
                transportLicense: busOwner.transportLicense,
                insuranceCertificates: busOwner.insuranceCertificates,
                createdAt: busOwner.createdAt,
                updatedAt: busOwner.updatedAt,
            },
        });
    } catch (error) {
        console.error("getMyBusOwnerKycStatus error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

const submitFleetForVerification = async (req, res) => {
    try {
        const userId = req.userInfo?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        const busDoc = await fleetService.createFleet(userId, req.body, req.files, "BUS_OWNER");

        return res.status(201).json({
            success: true,
            message: "Fleet details submitted for verification successfully!",
            data: busDoc,
        });
    } catch (error) {
        console.error("submitFleetForVerification error:", error);
        
        // Handle specific error messages from service
        const status = error.message.includes("exists") ? 409 : 400;
        
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

const getMyFleets = async (req, res) => {
    try {
        const userId = req.userInfo?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        const fleets = await fleetService.getFleetsByOwnerId(userId);

        return res.status(200).json({
            success: true,
            message: "Fleet status fetched successfully!",
            results: fleets.length,
            data: fleets,
        });
    } catch (error) {
        console.error("getMyFleets error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

const getFleetById = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const { fleetId } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        if (!fleetId) {
            return res.status(400).json({
                success: false,
                message: "Fleet ID is required.",
            });
        }

        const fleet = await fleetService.getFleetDetails(fleetId, userId);

        return res.status(200).json({
            success: true,
            message: "Fleet details fetched successfully!",
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

const updateFleet = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const { fleetId } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        if (!fleetId) {
            return res.status(400).json({
                success: false,
                message: "Fleet ID is required.",
            });
        }

        const updatedFleet = await fleetService.updateFleetDetails(fleetId, req.body, req.files, userId);

        return res.status(200).json({
            success: true,
            message: "Fleet details updated successfully!",
            data: updatedFleet,
        });
    } catch (error) {
        console.error("updateFleet error:", error);
        const status = error.message.includes("found") ? 404 : (error.message.includes("exists") ? 409 : 400);
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

const deleteFleet = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const { fleetId } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        if (!fleetId) {
            return res.status(400).json({
                success: false,
                message: "Fleet ID is required.",
            });
        }

        await fleetService.removeFleet(fleetId, userId);

        return res.status(200).json({
            success: true,
            message: "Fleet deleted successfully!",
        });
    } catch (error) {
        console.error("deleteFleet error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

const createBoardingPoint = async (req, res) => {
    try {
        const userId = req.userInfo?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        const newBoardingPoint = await boardingPointService.createBoardingPoints(userId, req.body);

        return res.status(201).json({
            success: true,
            message: "Boarding points created successfully!",
            data: newBoardingPoint,
        });
    } catch (error) {
        console.error("createBoardingPoint error:", error);
        return res.status(error.message.includes("provide") ? 400 : 500).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

const updateBoardingPoint = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const { boardingPointId } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        if (!boardingPointId) {
            return res.status(400).json({
                success: false,
                message: "Boarding Point ID is required.",
            });
        }

        const updatedBoardingPoint = await boardingPointService.updateBoardingPoints(boardingPointId, userId, req.body);

        return res.status(200).json({
            success: true,
            message: "Boarding points updated successfully!",
            data: updatedBoardingPoint,
        });
    } catch (error) {
        console.error("updateBoardingPoint error:", error);
        const status = error.message.includes("found") ? 404 : 400;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

const getMyBoardingPoints = async (req, res) => {
    try {
        const userId = req.userInfo?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        const myBoardingPoints = await boardingPointService.getBoardingPointsByUserId(userId);

        return res.status(200).json({
            success: true,
            message: "Boarding points fetched successfully!",
            results: myBoardingPoints.length,
            data: myBoardingPoints,
        });
    } catch (error) {
        console.error("getMyBoardingPoints error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

const deleteBoardingPoint = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const { boardingPointId } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        if (!boardingPointId) {
            return res.status(400).json({
                success: false,
                message: "Boarding Point ID is required.",
            });
        }

        await boardingPointService.deleteBoardingPoint(boardingPointId, userId);

        return res.status(200).json({
            success: true,
            message: "Boarding point deleted successfully!",
        });
    } catch (error) {
        console.error("deleteBoardingPoint error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

const getBoardingPointsById = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const { boardingPointId } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        if (!boardingPointId) {
            return res.status(400).json({
                success: false,
                message: "Boarding Point ID is required.",
            });
        }

        const boardingPoint = await boardingPointService.getBoardingPointById(boardingPointId, userId);

        return res.status(200).json({
            success: true,
            message: "Boarding point fetched successfully!",
            data: boardingPoint,
        });
    } catch (error) {
        console.error("getBoardingPointById error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Amenities CRUD

const createAmenity = async (req, res) => {
    try {
        const userId = req.userInfo?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        const newAmenity = await amenityService.createAmenity(userId, req.body);

        return res.status(201).json({
            success: true,
            message: "Amenities created successfully!",
            data: newAmenity,
        });
    } catch (error) {
        console.error("createAmenity error:", error);
        return res.status(error.message.includes("provide") ? 400 : 500).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

const getMyAmenities = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        const myAmenities = await amenityService.getAmenitiesByUserId(userId);

        return res.status(200).json({
            success: true,
            message: "Amenities fetched successfully!",
            results: myAmenities.length,
            data: myAmenities,
        });
    } catch (error) {
        console.error("getMyAmenities error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

const updateAmenity = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const { amenityId } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        if (!amenityId) {
            return res.status(400).json({
                success: false,
                message: "Amenity ID is required.",
            });
        }

        const updatedAmenity = await amenityService.updateAmenity(amenityId, userId, req.body);

        return res.status(200).json({
            success: true,
            message: "Amenities updated successfully!",
            data: updatedAmenity,
        });

    } catch (error) {
        console.error("updateAmenity error:", error);
        const status = error.message.includes("found") ? 404 : 400;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

const deleteAmenity = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const { amenityId } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        if (!amenityId) {
            return res.status(400).json({
                success: false,
                message: "Amenity ID is required.",
            });
        }

        await amenityService.deleteAmenity(amenityId, userId);

        return res.status(200).json({
            success: true,
            message: "Amenity deleted successfully!",
        });
    } catch (error) {
        console.error("deleteAmenity error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

const getAmenityById = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const { amenityId } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        if (!amenityId) {
            return res.status(400).json({
                success: false,
                message: "Amenity ID is required.",
            });
        }

        const amenity = await amenityService.getAmenityById(amenityId, userId);

        return res.status(200).json({
            success: true,
            message: "Amenity fetched successfully!",
            data: amenity,
        });
    } catch (error) {
        console.error("getAmenityById error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

module.exports = {
    submitBusOwnerKyc,
    getMyBusOwnerKycStatus,
    submitFleetForVerification,
    getMyFleets,
    getFleetById,
    updateFleet,
    deleteFleet,
    createBoardingPoint,
    updateBoardingPoint,
    getMyBoardingPoints,
    deleteBoardingPoint,
    getBoardingPointsById,
    createAmenity,
    getMyAmenities,
    updateAmenity,
    deleteAmenity,
    getAmenityById,
};