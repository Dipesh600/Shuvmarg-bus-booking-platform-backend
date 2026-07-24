const { describe, it, mock } = require('node:test');
const assert = require('node:assert');
const { createPassengerBookingHistoryImageService } = require('../../../src/modules/booking/passenger-booking-history/passenger-booking-history-image.service');

describe('Passenger Booking History Image Service', () => {
  it('factory returns a function', () => {
    const service = createPassengerBookingHistoryImageService(() => {});
    assert.strictEqual(typeof service, 'function');
  });

  it('handles empty array', async () => {
    const s3Mock = mock.fn();
    const service = createPassengerBookingHistoryImageService(s3Mock);
    const result = await service([]);
    assert.deepStrictEqual(result, []);
    assert.strictEqual(s3Mock.mock.callCount(), 0);
  });

  it('every key called exactly once and every call receives exactly one argument', async () => {
    const s3Mock = mock.fn(async (key) => `url-${key}`);
    const service = createPassengerBookingHistoryImageService(s3Mock);
    await service(['a', 'b', 'c']);
    assert.strictEqual(s3Mock.mock.callCount(), 3);
    assert.deepStrictEqual(s3Mock.mock.calls[0].arguments, ['a']);
    assert.deepStrictEqual(s3Mock.mock.calls[1].arguments, ['b']);
    assert.deepStrictEqual(s3Mock.mock.calls[2].arguments, ['c']);
  });

  it('calls start concurrently using deferred promises and output order follows input order despite resolution order', async () => {
    const resolvers = {};
    const callOrder = [];
    const s3Mock = mock.fn((key) => {
      callOrder.push(key);
      return new Promise((resolve) => {
        resolvers[key] = resolve;
      });
    });
    const service = createPassengerBookingHistoryImageService(s3Mock);
    
    const promise = service(['a', 'b', 'c']);
    assert.deepStrictEqual(callOrder, ['a', 'b', 'c']);
    
    resolvers['c']('url-c');
    resolvers['a']('url-a');
    resolvers['b']('url-b');
    
    const result = await promise;
    assert.deepStrictEqual(result, ['url-a', 'url-b', 'url-c']);
  });

  it('falsy resolved values are filtered', async () => {
    const s3Mock = mock.fn(async (key) => key === 'b' ? null : (key === 'c' ? '' : `url-${key}`));
    const service = createPassengerBookingHistoryImageService(s3Mock);
    const result = await service(['a', 'b', 'c', 'd']);
    assert.deepStrictEqual(result, ['url-a', 'url-d']);
  });

  it('duplicate keys are not deduplicated', async () => {
    const s3Mock = mock.fn(async (key) => `url-${key}`);
    const service = createPassengerBookingHistoryImageService(s3Mock);
    const result = await service(['a', 'a']);
    assert.deepStrictEqual(result, ['url-a', 'url-a']);
    assert.strictEqual(s3Mock.mock.callCount(), 2);
  });

  it('rejection propagates, no per-image recovery, no console logging', async () => {
    const consoleError = mock.method(console, 'error');
    const s3Mock = mock.fn(async (key) => {
      if (key === 'b') throw new Error('S3 failed');
      return `url-${key}`;
    });
    const service = createPassengerBookingHistoryImageService(s3Mock);
    
    await assert.rejects(() => service(['a', 'b']), { message: 'S3 failed' });
    assert.strictEqual(consoleError.mock.callCount(), 0);
  });

  it('non-array input throws naturally through .map()', async () => {
    const service = createPassengerBookingHistoryImageService(() => {});
    await assert.rejects(() => service(null), (err) => err instanceof TypeError);
  });
});
