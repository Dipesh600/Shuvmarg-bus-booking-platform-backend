const { mock } = require("node:test");

const Booking = require("../../models/bookTicketModel");
const Transaction = require("../../models/transactionModel");
const Review = require("../../models/reviewModel");
const Refund = require("../../models/refundModel");
const s3Service = require("../../services/s3Service.js");

function setupHarness() {
  const originalGetPresignedUrl = s3Service.getPresignedUrl;

  const mocks = {
    bookingFind: mock.method(Booking, "find", () => ({ populate: () => ({ lean: () => Promise.resolve([]) }) })),
    transactionFind: mock.method(Transaction, "find", () => ({ select: () => ({ lean: () => Promise.resolve([]) }) })),
    reviewFind: mock.method(Review, "find", () => ({ select: () => ({ lean: () => Promise.resolve([]) }) })),
    refundFind: mock.method(Refund, "find", () => ({ select: () => ({ lean: () => Promise.resolve([]) }) })),
    getPresignedUrl: mock.fn(async (key) => `https://s3.url/${key}`),
  };
  s3Service.getPresignedUrl = mocks.getPresignedUrl;

  const passengerBookingHistory = require("../../src/modules/booking/passenger-booking-history");

  function restore() {
    mocks.bookingFind.mock.restore();
    mocks.transactionFind.mock.restore();
    mocks.reviewFind.mock.restore();
    mocks.refundFind.mock.restore();
    s3Service.getPresignedUrl = originalGetPresignedUrl;
  }

  return {
    passengerBookingHistory,
    mocks,
    restore,
  };
}

module.exports = { setupHarness };
