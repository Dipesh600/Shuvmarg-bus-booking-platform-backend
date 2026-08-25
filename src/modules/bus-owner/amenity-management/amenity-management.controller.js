"use strict";

function unauthorized(res) {
  return res.status(401).json({
    success: false,
    message: "Unauthorized. Please login first.",
  });
}

function requireId(req, res) {
  if (req.body?.amenityId) return true;
  res.status(400).json({ success: false, message: "Amenity ID is required." });
  return false;
}

function errorStatus(error) {
  if (error.statusCode) return error.statusCode;
  return /not found/i.test(error.message || "") ? 404 : 500;
}

function createAmenityManagementController({ amenityService, logger = console }) {
  async function createAmenity(req, res) {
    try {
      const userId = req.userInfo?.id;
      if (!userId) return unauthorized(res);
      const data = await amenityService.createAmenity(req.body, userId);
      return res.status(201).json({
        success: true, message: "Amenities created successfully!", data,
      });
    } catch (error) {
      logger.error("createAmenity error:", error);
      return res.status(errorStatus(error)).json({
        success: false, message: error.message || "Internal Server Error",
        ...(error.code ? { errorCode: error.code } : {}),
        ...(error.details ? { details: error.details } : {}),
      });
    }
  }

  async function getMyAmenities(req, res) {
    try {
      const userId = req.userInfo?.id;
      if (!userId) return unauthorized(res);
      const data = await amenityService.getAmenitiesByUserId(userId);
      return res.status(200).json({
        success: true,
        message: "Amenities fetched successfully!",
        results: data.length,
        data,
      });
    } catch (error) {
      logger.error("getMyAmenities error:", error);
      return res.status(500).json({
        success: false, message: "Internal Server Error", error: error.message,
      });
    }
  }

  async function updateAmenity(req, res) {
    try {
      const userId = req.userInfo?.id;
      const { amenityId } = req.body || {};
      if (!userId) return unauthorized(res);
      if (!requireId(req, res)) return res;
      const data = await amenityService.updateAmenity(amenityId, req.body, userId);
      return res.status(200).json({
        success: true, message: "Amenities updated successfully!", data,
      });
    } catch (error) {
      logger.error("updateAmenity error:", error);
      return res.status(errorStatus(error)).json({
        success: false, message: error.message || "Internal Server Error",
        ...(error.code ? { errorCode: error.code } : {}),
        ...(error.details ? { details: error.details } : {}),
      });
    }
  }

  async function deleteAmenity(req, res) {
    try {
      const userId = req.userInfo?.id;
      const { amenityId } = req.body || {};
      if (!userId) return unauthorized(res);
      if (!requireId(req, res)) return res;
      await amenityService.deleteAmenity(amenityId, userId);
      return res.status(200).json({
        success: true, message: "Amenity deleted successfully!",
      });
    } catch (error) {
      logger.error("deleteAmenity error:", error);
      return res.status(errorStatus(error)).json({
        success: false, message: error.message || "Internal Server Error",
        ...(error.code ? { errorCode: error.code } : {}),
        ...(error.details ? { details: error.details } : {}),
      });
    }
  }

  async function getAmenityById(req, res) {
    try {
      const userId = req.userInfo?.id;
      const { amenityId } = req.body || {};
      if (!userId) return unauthorized(res);
      if (!requireId(req, res)) return res;
      const data = await amenityService.getAmenityById(amenityId, userId);
      return res.status(200).json({
        success: true, message: "Amenity fetched successfully!", data,
      });
    } catch (error) {
      logger.error("getAmenityById error:", error);
      return res.status(errorStatus(error)).json({
        success: false, message: error.message || "Internal Server Error",
        ...(error.code ? { errorCode: error.code } : {}),
        ...(error.details ? { details: error.details } : {}),
      });
    }
  }

  return {
    async getAvailableAmenities(req, res) {
      const userId = req.userInfo?.id;
      if (!userId) return unauthorized(res);
      try {
        const data = await amenityService.getAmenitiesForOwner(userId);
        return res.status(200).json({ success: true, data });
      } catch (error) {
        logger.error("Error fetching available amenities:", error);
        return res.status(500).json({ success: false, message: "Unable to load amenities." });
      }
    },
    createAmenity, getMyAmenities, updateAmenity, deleteAmenity, getAmenityById,
  };
}

module.exports = { createAmenityManagementController };
