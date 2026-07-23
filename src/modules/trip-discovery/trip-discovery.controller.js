function createTripDiscoveryController({ searchTripsService, logger = console }) {
  const searchTrips = async (req, res) => {
    try {
      const { from, to, date, shift } = req.body;
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, parseInt(req.query.limit) || 10);

      logger.log("Search Query:", { from, to, date, shift, page, limit });

      const result = await searchTripsService({ from, to, date, shift, page, limit });

      if (result.noRoutes) {
        return res.status(200).json({
          success: true,
          message: "No routes found for the selected locations.",
          results: 0,
          total: 0,
          page: 1,
          totalPages: 0,
          data: []
        });
      }

      return res.status(200).json({
        success: true,
        message: result.data.length === 0 ? "No trips found" : "Trips found successfully",
        results: result.results,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        data: result.data
      });
    } catch (error) {
      logger.error("searchTrips error:", error);
      return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
    }
  };

  return { searchTrips };
}

module.exports = {
  createTripDiscoveryController
};
