const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { createPassengerBookingHistoryService } = require('../../../src/modules/booking/passenger-booking-history/passenger-booking-history.service');

describe('Passenger Booking History Service Errors', () => {
  let mockRepository, mockMapper, mockImageService, service;
  let consoleError;

  beforeEach(() => {
    consoleError = mock.method(console, 'error');
    mockRepository = {
      findBookings: mock.fn(async () => [{ _id: 'b1', tripId: { busId: { fleetImages: ['img'] } } }]),
      findTransactions: mock.fn(async () => []),
      findReviews: mock.fn(async () => []),
      findRefunds: mock.fn(async () => []),
    };
    mockMapper = { mapToPassengerHistory: mock.fn(async () => 'mapped') };
    mockImageService = mock.fn(async () => ['url1']);
    service = createPassengerBookingHistoryService(mockRepository, mockMapper, mockImageService);
  });

  afterEach(() => mock.restoreAll());

  it('Booking rejection propagates, no logging', async () => {
    mockRepository.findBookings.mock.mockImplementation(async () => { throw new Error('BookingError'); });
    await assert.rejects(() => service.getPassengerBookingHistory('user1'), { message: 'BookingError' });
    assert.strictEqual(consoleError.mock.callCount(), 0);
  });

  it('Transaction rejection propagates, no logging', async () => {
    mockRepository.findTransactions.mock.mockImplementation(async () => { throw new Error('TransactionError'); });
    await assert.rejects(() => service.getPassengerBookingHistory('user1'), { message: 'TransactionError' });
    assert.strictEqual(consoleError.mock.callCount(), 0);
  });

  it('Review rejection propagates, no logging', async () => {
    mockRepository.findReviews.mock.mockImplementation(async () => { throw new Error('ReviewError'); });
    await assert.rejects(() => service.getPassengerBookingHistory('user1'), { message: 'ReviewError' });
    assert.strictEqual(consoleError.mock.callCount(), 0);
  });

  it('Refund rejection propagates, no logging', async () => {
    mockRepository.findRefunds.mock.mockImplementation(async () => { throw new Error('RefundError'); });
    await assert.rejects(() => service.getPassengerBookingHistory('user1'), { message: 'RefundError' });
    assert.strictEqual(consoleError.mock.callCount(), 0);
  });

  it('image-service rejection propagates, no logging', async () => {
    mockImageService.mock.mockImplementation(async () => { throw new Error('ImageError'); });
    await assert.rejects(() => service.getPassengerBookingHistory('user1'), { message: 'ImageError' });
    assert.strictEqual(consoleError.mock.callCount(), 0);
  });

  it('mapper rejection propagates, no logging', async () => {
    mockMapper.mapToPassengerHistory.mock.mockImplementation(async () => { throw new Error('MapperError'); });
    await assert.rejects(() => service.getPassengerBookingHistory('user1'), { message: 'MapperError' });
    assert.strictEqual(consoleError.mock.callCount(), 0);
  });
});
