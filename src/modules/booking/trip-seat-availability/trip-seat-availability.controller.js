const createTripSeatAvailabilityController = (service) => {
  return async (req, res) => {
    try {
      const { tripId } = req.body;

      if (!tripId) {
        return res.status(400).json({
          status: false,
          message: "Please Provide Trip Id!"
        });
      }

      const currentUserId = req.userInfo ? req.userInfo.id : null;
      
      const result = await service(tripId, currentUserId);

      if (!result) {
        return res.status(404).json({
          status: false,
          message: "Seats Not Found!"
        });
      }

      return res.status(200).json({
        status: true,
        message: "Successfully fetched seats!",
        data: result
      });
    } catch (error) {
      return res.status(500).json({
        status: true,
        message: "Internal Server Error!"
      });
    }
  };
};

module.exports = {
  createTripSeatAvailabilityController
};
