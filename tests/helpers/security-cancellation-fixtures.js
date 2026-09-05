'use strict';
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const Booking = require('../../models/bookTicketModel');
const Trip = require('../../models/tripModel');
const Seat = require('../../models/seatsModel');
const Refund = require('../../models/refundModel');
const Wallet = require('../../models/walletModel');
const Ledger = require('../../models/smLedgerModel');
const ScratchCard = require('../../models/scratchCardModel');
const PlatformConfig = require('../../models/platformConfigModel');
const { createPassengerBookingCancellationRepository } = require('../../src/modules/booking/passenger-booking-cancellation/passenger-booking-cancellation.repository');
const { createPassengerBookingCancellationSeatService } = require('../../src/modules/booking/passenger-booking-cancellation/passenger-booking-cancellation-seat.service');
const { createPassengerBookingCancellationRefundService } = require('../../src/modules/booking/passenger-booking-cancellation/passenger-booking-cancellation-refund.service');
const { createPassengerBookingCancellationService } = require('../../src/modules/booking/passenger-booking-cancellation/passenger-booking-cancellation.service');
const ledgerService = require('../../src/modules/wallet/sm-ledger');
const walletService = require('../../services/walletService');
let replica;
const models = [Booking, Trip, Seat, Refund, Wallet, Ledger, ScratchCard, PlatformConfig];
async function start() {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.2.6' },
    instanceOpts: [{ args: ['--setParameter', 'indexBuildMinAvailableDiskSpaceMB=32'] }], replSet: { count: 1 } });
  await mongoose.connect(replica.getUri('security-cancellation-tests'));
  await Promise.all(models.map(model => model.init()));
}
async function stop() { await mongoose.disconnect(); if (replica) await replica.stop(); }
async function seed() {
  await Promise.all(models.map(model => model.deleteMany({})));
  const userId = new mongoose.Types.ObjectId();
  const tripId = new mongoose.Types.ObjectId();
  await Trip.collection.insertOne({ _id: tripId, tripDate: new Date('2099-01-01'), departureTime: '10:00' });
  const booking = await Booking.create({ userId, tripId, ticketId: 'SEC-TICKET', status: 'booked',
    seats: ['A1'], totalAmount: 1000, originalAmount: 1000 });
  await Seat.create({ tripId, seata: [{ seatNo: 'A1', booked: true, bookedBy: userId }] });
  await Wallet.create({ userId, status: 'active', balance: 0 });
  await Ledger.create({ userId, bookingId: booking._id, type: 'CASHBACK', direction: 'CREDIT',
    status: 'ACTIVE', amount: 10, remainingAmount: 10, expires_at: new Date('2099-01-01') });
  return { booking, userId: String(userId), tripId };
}
function build({ repository = createPassengerBookingCancellationRepository(),
  credit = walletService.creditWallet, clawback = ledgerService.clawbackCashback,
  notify = async () => {} } = {}) {
  return createPassengerBookingCancellationService(repository,
    createPassengerBookingCancellationSeatService(),
    createPassengerBookingCancellationRefundService(repository, () => clawback, () => credit),
    { sendCancellationNotifications: notify });
}
module.exports = { start, stop, seed, build, createPassengerBookingCancellationRepository,
  Booking, Seat, Refund, Wallet, Ledger, PlatformConfig, walletService, ledgerService };
