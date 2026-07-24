const passengerBookingHistoryRepository = require("./passenger-booking-history.repository");
const passengerBookingHistoryMapper = require("./passenger-booking-history.mapper");
const { createPassengerBookingHistoryImageService } = require("./passenger-booking-history-image.service");
const { createPassengerBookingHistoryService } = require("./passenger-booking-history.service");
const { createPassengerBookingHistoryController } = require("./passenger-booking-history.controller");
const s3Service = require("../../../../services/s3Service");

const imageService = createPassengerBookingHistoryImageService((key) => s3Service.getPresignedUrl(key));
const service = createPassengerBookingHistoryService(passengerBookingHistoryRepository, passengerBookingHistoryMapper, imageService);
const getPassengerBookingHistory = createPassengerBookingHistoryController(service);

module.exports = {
  getPassengerBookingHistory,
};
