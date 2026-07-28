"use strict";

const createFleetWorkstationController = ({
  dashboardService,
  manifestService,
  tripStatusService,
  driverAssignmentService,
  logger,
}) => {
  const handleError = (operation, error, res, withStack = false) => {
    logger.error(`fleetWorkstationController: ${operation} error`, {
      error: error.message,
      ...(withStack ? { stack: error.stack } : {}),
    });
    return res.status(500).json({ success: false, message: error.message });
  };

  const getFleetWorkstation = async (req, res) => {
    try {
      const data = await dashboardService.getDashboard(req.params.id);
      if (!data) {
        return res
          .status(404)
          .json({ success: false, message: "Fleet not found." });
      }
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return handleError("getFleetWorkstation", error, res, true);
    }
  };

  const getTripManifest = async (req, res) => {
    try {
      const data = await manifestService.getManifest(req.params);
      if (!data) {
        return res.status(404).json({
          success: false,
          message: "Trip not found or does not belong to this fleet.",
        });
      }
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return handleError("getTripManifest", error, res, true);
    }
  };

  const updateTripStatus = async (req, res) => {
    try {
      const { status, cancellationReason } = req.body;
      const result = await tripStatusService.updateStatus({
        ...req.params,
        status,
        cancellationReason,
        adminId: req.user.id,
      });
      if (result.statusCode) {
        return res
          .status(result.statusCode)
          .json({ success: false, message: result.message });
      }
      return res.status(200).json({
        success: true,
        message: `Trip status updated to ${req.body.status}`,
        data: result.trip,
      });
    } catch (error) {
      return handleError("updateTripStatus", error, res);
    }
  };

  const reassignTripDriver = async (req, res) => {
    try {
      const { driverId, reason } = req.body;
      const result = await driverAssignmentService.reassign({
        ...req.params,
        driverId,
        reason,
        adminId: req.user.id,
      });
      if (result.statusCode) {
        return res
          .status(result.statusCode)
          .json({ success: false, message: result.message });
      }
      return res.status(200).json({
        success: true,
        message: "Driver reassigned successfully",
        data: result.trip,
      });
    } catch (error) {
      return handleError("reassignTripDriver", error, res);
    }
  };

  return {
    getFleetWorkstation,
    getTripManifest,
    updateTripStatus,
    reassignTripDriver,
  };
};

module.exports = { createFleetWorkstationController };
