const { mock } = require("node:test");

const Booking = require("../../models/bookTicketModel.js");
const Trip = require("../../models/tripModel");
const Seat = require("../../models/seatsModel.js");
const Refund = require("../../models/refundModel");
const UserDeviceInfo = require("../../models/userDeviceInfoModel.js");
const refundCalculatorService = require("../../services/refundCalculatorService");
const notificationManagerApi = require("../../controllers/notificationController/notification_manager.js");
const smLedgerService = require("../../services/smLedgerService");
const walletService = require("../../services/walletService");

function setupHarness() {
  const mocks = {
    bookingFindOne: mock.method(Booking, "findOne", () => Promise.resolve(null)),
    tripFindById: mock.method(Trip, "findById", () => ({ populate: () => Promise.resolve(null) })),
    seatFindOne: mock.method(Seat, "findOne", () => Promise.resolve(null)),
    refundCreate: mock.method(Refund, "create", () => Promise.resolve({})),
    userDeviceInfoFind: mock.method(UserDeviceInfo, "find", () => Promise.resolve([])),
    calculateRefund: mock.method(refundCalculatorService, "calculateRefund", () => Promise.resolve({})),
    createLocalNotification: mock.method(notificationManagerApi, "createLocalNotification", () => Promise.resolve()),
    notificationManager: mock.method(notificationManagerApi, "notificationManager", () => Promise.resolve()),
    clawbackCashback: mock.method(smLedgerService, "clawbackCashback", () => Promise.resolve({ clawedBack: 0 })),
    creditWallet: mock.method(walletService, "creditWallet", () => Promise.resolve({})),
  };

  // Force ticketController to reload so we can test cleanly if needed
  const controllerPath = require.resolve("../../controllers/ticketController/ticketController");
  delete require.cache[controllerPath];
  const ticketController = require("../../controllers/ticketController/ticketController");

  function restore() {
    mocks.bookingFindOne.mock.restore();
    mocks.tripFindById.mock.restore();
    mocks.seatFindOne.mock.restore();
    mocks.refundCreate.mock.restore();
    mocks.userDeviceInfoFind.mock.restore();
    mocks.calculateRefund.mock.restore();
    mocks.createLocalNotification.mock.restore();
    mocks.notificationManager.mock.restore();
    mocks.clawbackCashback.mock.restore();
    mocks.creditWallet.mock.restore();
    delete require.cache[controllerPath];
  }

  return {
    ticketController,
    mocks,
    restore,
  };
}

module.exports = { setupHarness };
