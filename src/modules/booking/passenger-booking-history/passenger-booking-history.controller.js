const createPassengerBookingHistoryController = (service) => {
  return async (req, res) => {
    try {
      const userId = req.userInfo.id;
      const result = await service.getPassengerBookingHistory(userId);

      return res.status(200).json({
        status: true,
        message: "Successfully fetched Booking History",
        data: result
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({
        status: false,
        message: "Internal Server Error"
      });
    }
  };
};

module.exports = {
  createPassengerBookingHistoryController,
};
