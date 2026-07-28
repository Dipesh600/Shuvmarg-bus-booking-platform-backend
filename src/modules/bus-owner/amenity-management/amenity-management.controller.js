"use strict";

function unauthorized(res) {
  return res.status(401).json({
    success: false,
    message: "Unauthorized. Please login first.",
  });
}

function requireId(req, res) {
  if (req.body.amenityId) return true;
  res.status(400).json({ success: false, message: "Amenity ID is required." });
  return false;
}

function createAmenityManagementController({ amenityService, logger = console }) {
  async function createAmenity(req, res) {
    try {
      const userId = req.userInfo?.id;
      if (!userId) return unauthorized(res);
      const data = await amenityService.createAmenity(userId, req.body);
      return res.status(201).json({
        success: true, message: "Amenities created successfully!", data,
      });
    } catch (error) {
      logger.error("createAmenity error:", error);
      return res.status(error.message.includes("provide") ? 400 : 500).json({
        success: false, message: error.message || "Internal Server Error",
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
      const { amenityId } = req.body;
      if (!userId) return unauthorized(res);
      if (!requireId(req, res)) return res;
      const data = await amenityService.updateAmenity(
        amenityId, userId, req.body
      );
      return res.status(200).json({
        success: true, message: "Amenities updated successfully!", data,
      });
    } catch (error) {
      logger.error("updateAmenity error:", error);
      return res.status(error.message.includes("found") ? 404 : 400).json({
        success: false, message: error.message || "Internal Server Error",
      });
    }
  }

  async function deleteAmenity(req, res) {
    try {
      const userId = req.userInfo?.id;
      const { amenityId } = req.body;
      if (!userId) return unauthorized(res);
      if (!requireId(req, res)) return res;
      await amenityService.deleteAmenity(amenityId, userId);
      return res.status(200).json({
        success: true, message: "Amenity deleted successfully!",
      });
    } catch (error) {
      logger.error("deleteAmenity error:", error);
      return res.status(error.message.includes("found") ? 404 : 500).json({
        success: false, message: error.message || "Internal Server Error",
      });
    }
  }

  async function getAmenityById(req, res) {
    try {
      const userId = req.userInfo?.id;
      const { amenityId } = req.body;
      if (!userId) return unauthorized(res);
      if (!requireId(req, res)) return res;
      const data = await amenityService.getAmenityById(
        amenityId, userId
      );
      return res.status(200).json({
        success: true, message: "Amenity fetched successfully!", data,
      });
    } catch (error) {
      logger.error("getAmenityById error:", error);
      return res.status(error.message.includes("found") ? 404 : 500).json({
        success: false, message: error.message || "Internal Server Error",
      });
    }
  }

  return {
    createAmenity, getMyAmenities, updateAmenity, deleteAmenity, getAmenityById,
  };
}

module.exports = { createAmenityManagementController };
