const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { createPassengerBookingHistoryService } = require('../../../src/modules/booking/passenger-booking-history/passenger-booking-history.service');

describe('Passenger Booking History Service', () => {
  let mockRepository, mockMapper, mockImageService, service, callOrder;

  beforeEach(() => {
    callOrder = [];
    const trackCall = (name) => () => { callOrder.push(name); return Promise.resolve([]); };
    mockRepository = {
      findBookings: mock.fn(trackCall('Booking')),
      findTransactions: mock.fn(trackCall('Transaction')),
      findReviews: mock.fn(trackCall('Review')),
      findRefunds: mock.fn(trackCall('Refund')),
    };
    mockMapper = { mapToPassengerHistory: mock.fn(async () => 'mapped-booking') };
    mockImageService = mock.fn(async () => ['url1']);
    service = createPassengerBookingHistoryService(mockRepository, mockMapper, mockImageService);
  });

  afterEach(() => mock.restoreAll());

  it('repository call order: Booking → Transaction → Review → Refund, even if empty bookings', async () => {
    await service.getPassengerBookingHistory('user1');
    assert.deepStrictEqual(callOrder, ['Booking', 'Transaction', 'Review', 'Refund']);
  });

  it('booking IDs preserve values, order and duplicates', async () => {
    mockRepository.findBookings.mock.mockImplementation(async () => [{ _id: 'b1' }, { _id: 'b1' }, { _id: 'b2' }]);
    await service.getPassengerBookingHistory('user1');
    const ids = mockRepository.findTransactions.mock.calls[0].arguments[0];
    assert.deepStrictEqual(ids, ['b1', 'b1', 'b2']);
  });

  it('maps use String IDs, later duplicates win', async () => {
    const booking = { _id: { toString: () => 'b1' } };
    mockRepository.findBookings.mock.mockImplementation(async () => [booking]);
    mockRepository.findTransactions.mock.mockImplementation(async () => [{ bookingId: 'b1', id: 't1' }, { bookingId: 'b1', id: 't2' }]);
    mockRepository.findRefunds.mock.mockImplementation(async () => [{ bookingId: 'b1', id: 'rf1' }, { bookingId: 'b1', id: 'rf2' }]);
    mockRepository.findReviews.mock.mockImplementation(async () => [{ bookingId: 'b1' }, { bookingId: 'b1' }]);
    
    await service.getPassengerBookingHistory('user1');
    const mapArgs = mockMapper.mapToPassengerHistory.mock.calls[0].arguments;
    
    assert.strictEqual(mapArgs[1].id, 't2');
    assert.strictEqual(mapArgs[2].id, 'rf2');
    assert.ok(mapArgs[3].has('b1'));
  });

  it('outer booking transformations start concurrently and result order follows booking order', async () => {
    let resolveB1, resolveB2;
    const p1 = new Promise(r => resolveB1 = r);
    const p2 = new Promise(r => resolveB2 = r);
    
    let startedB1, startedB2;
    const pStartedB1 = new Promise(r => startedB1 = r);
    const pStartedB2 = new Promise(r => startedB2 = r);

    mockMapper.mapToPassengerHistory.mock.mockImplementation(async (booking) => {
      if (booking._id === 'b1') {
        startedB1();
        await p1;
        return 'mapped-b1';
      }
      if (booking._id === 'b2') {
        startedB2();
        await p2;
        return 'mapped-b2';
      }
    });

    mockRepository.findBookings.mock.mockImplementation(async () => [{ _id: 'b1' }, { _id: 'b2' }]);
    
    const resultPromise = service.getPassengerBookingHistory('user1');
    
    // Wait until both mapping functions have been invoked
    await Promise.all([pStartedB1, pStartedB2]);
    
    // Prove both mapper invocations occur before either deferred promise is resolved
    // and mapper call count is exactly 2 before resolution
    assert.strictEqual(mockMapper.mapToPassengerHistory.mock.callCount(), 2);
    
    // Resolve booking two first
    resolveB2();
    // Resolve booking one second
    resolveB1();
    
    const result = await resultPromise;
    // Prove two bookings are returned and final result remains in booking order
    assert.deepStrictEqual(result, ['mapped-b1', 'mapped-b2']);
  });

  it('no trip skips image service', async () => {
    mockRepository.findBookings.mock.mockImplementation(async () => [{ _id: 'b1' }]);
    await service.getPassengerBookingHistory('user1');
    assert.strictEqual(mockImageService.mock.callCount(), 0);
  });

  it('trip without bus skips image service', async () => {
    mockRepository.findBookings.mock.mockImplementation(async () => [{ _id: 'b1', tripId: {} }]);
    await service.getPassengerBookingHistory('user1');
    assert.strictEqual(mockImageService.mock.callCount(), 0);
  });

  it('bus passes raw fleetImages once to image service', async () => {
    mockRepository.findBookings.mock.mockImplementation(async () => [{ _id: 'b1', tripId: { busId: { fleetImages: ['img1', 'img2'] } } }]);
    await service.getPassengerBookingHistory('user1');
    assert.strictEqual(mockImageService.mock.callCount(), 1);
    assert.deepStrictEqual(mockImageService.mock.calls[0].arguments[0], ['img1', 'img2']);
  });
});
