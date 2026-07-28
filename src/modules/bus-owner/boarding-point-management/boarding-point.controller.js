"use strict";

function unauthorized(res) {
  return res.status(401).json({
    success: false,
    message: "Unauthorized. Please login first.",
  });
}

function requireId(req, res) {
  if (req.body.boardingPointId) return true;
  res.status(400).json({
    success: false, message: "Boarding Point ID is required.",
  });
  return false;
}

function createBoardingPointController({
  boardingPointService,
  logger = console,
}) {
  async function createBoardingPoint(req, res) {
    try {
      const userId = req.userInfo?.id;
      if (!userId) return unauthorized(res);
      const data = await boardingPointService.createBoardingPoints(
        userId, req.body
      );
      return res.status(201).json({
        success: true, message: "Boarding points created successfully!", data,
      });
    } catch (error) {
      logger.error("createBoardingPoint error:", error);
      return res.status(error.message.includes("provide") ? 400 : 500).json({
        success: false, message: error.message || "Internal Server Error",
      });
    }
  }

  async function getMyBoardingPoints(req, res) {
    try {
      const userId = req.userInfo?.id;
      if (!userId) return unauthorized(res);
      const data = await boardingPointService.getBoardingPointsByUserId(userId);
      return res.status(200).json({
        success: true,
        message: "Boarding points fetched successfully!",
        results: data.length,
        data,
      });
    } catch (error) {
      logger.error("getMyBoardingPoints error:", error);
      return res.status(500).json({
        success: false, message: "Internal Server Error", error: error.message,
      });
    }
  }

  async function updateBoardingPoint(req, res) {
    try {
      const userId = req.userInfo?.id;
      const { boardingPointId } = req.body;
      if (!userId) return unauthorized(res);
      if (!requireId(req, res)) return res;
      const data = await boardingPointService.updateBoardingPoints(
        boardingPointId, userId, req.body
      );
      return res.status(200).json({
        success: true, message: "Boarding points updated successfully!", data,
      });
    } catch (error) {
      logger.error("updateBoardingPoint error:", error);
      return res.status(error.message.includes("found") ? 404 : 400).json({
        success: false, message: error.message || "Internal Server Error",
      });
    }
  }

  async function deleteBoardingPoint(req, res) {
    try {
      const userId = req.userInfo?.id;
      const { boardingPointId } = req.body;
      if (!userId) return unauthorized(res);
      if (!requireId(req, res)) return res;
      await boardingPointService.deleteBoardingPoint(
        boardingPointId, userId
      );
      return res.status(200).json({
        success: true, message: "Boarding point deleted successfully!",
      });
    } catch (error) {
      logger.error("deleteBoardingPoint error:", error);
      return res.status(error.message.includes("found") ? 404 : 500).json({
        success: false, message: error.message || "Internal Server Error",
      });
    }
  }

  async function getBoardingPointsById(req, res) {
    try {
      const userId = req.userInfo?.id;
      const { boardingPointId } = req.body;
      if (!userId) return unauthorized(res);
      if (!requireId(req, res)) return res;
      const data = await boardingPointService.getBoardingPointById(
        boardingPointId, userId
      );
      return res.status(200).json({
        success: true, message: "Boarding point fetched successfully!", data,
      });
    } catch (error) {
      logger.error("getBoardingPointById error:", error);
      return res.status(error.message.includes("found") ? 404 : 500).json({
        success: false, message: error.message || "Internal Server Error",
      });
    }
  }

  return {
    createBoardingPoint, getMyBoardingPoints, updateBoardingPoint,
    deleteBoardingPoint, getBoardingPointsById,
  };
}

module.exports = { createBoardingPointController };
