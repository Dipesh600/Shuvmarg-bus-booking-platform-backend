'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('Admin Coupon Route Wiring Characterization', async () => {
  const middlewarePath = require.resolve('../../middleware/adminMiddleware.js');
  const controllerPath = require.resolve('../../controllers/adminController/coupon-controller/adminCouponController.js');
  const analyticsPath = require.resolve('../../src/modules/coupon/admin/analytics/index.js');
  const statisticsPath = require.resolve('../../src/modules/coupon/admin/statistics/index.js');
  const routesPath = require.resolve('../../src/modules/coupon/admin/coupon-admin.routes.js');
  const indexPath = require.resolve('../../src/modules/coupon/admin/index.js');

  const adminMiddlewareStub = function adminMiddleware(req, res, next) {};
  const createCouponStub = function createCoupon(req, res) {};
  const uploadCouponImageStub = function uploadCouponImage(req, res) {};
  const deleteOrphanedCouponImageStub = function deleteOrphanedCouponImage(req, res) {};
  const getAllCouponsStub = function getAllCoupons(req, res) {};
  const getCouponUsageStatsStub = function getCouponUsageStats(req, res) {};
  const getCouponAnalyticsStub = function getCouponAnalytics(req, res) {};
  const getCouponByIdStub = function getCouponById(req, res) {};
  const updateCouponStub = function updateCoupon(req, res) {};
  const deleteCouponStub = function deleteCoupon(req, res) {};
  const toggleCouponStatusStub = function toggleCouponStatus(req, res) {};

  const oldMiddlewareCache = require.cache[middlewarePath];
  const oldControllerCache = require.cache[controllerPath];
  const oldAnalyticsCache = require.cache[analyticsPath];
  const oldStatisticsCache = require.cache[statisticsPath];
  const oldRoutesCache = require.cache[routesPath];
  const oldIndexCache = require.cache[indexPath];

  try {
    require.cache[middlewarePath] = {
      id: middlewarePath,
      filename: middlewarePath,
      loaded: true,
      exports: adminMiddlewareStub,
    };

    require.cache[controllerPath] = {
      id: controllerPath,
      filename: controllerPath,
      loaded: true,
      exports: {
        createCoupon: createCouponStub,
        uploadCouponImage: uploadCouponImageStub,
        deleteOrphanedCouponImage: deleteOrphanedCouponImageStub,
        getAllCoupons: getAllCouponsStub,
        getCouponById: getCouponByIdStub,
        updateCoupon: updateCouponStub,
        deleteCoupon: deleteCouponStub,
        toggleCouponStatus: toggleCouponStatusStub,
      },
    };

    require.cache[analyticsPath] = {
      id: analyticsPath,
      filename: analyticsPath,
      loaded: true,
      exports: {
        getCouponAnalytics: getCouponAnalyticsStub,
      },
    };

    require.cache[statisticsPath] = {
      id: statisticsPath,
      filename: statisticsPath,
      loaded: true,
      exports: {
        getCouponUsageStats: getCouponUsageStatsStub,
      },
    };

    delete require.cache[routesPath];
    delete require.cache[indexPath];

    const router = require('../../src/modules/coupon/admin/coupon-admin.routes.js');
    const indexExport = require('../../src/modules/coupon/admin/index.js');

    // Verify module exports
    assert.equal(typeof router, 'function');
    assert.ok(Array.isArray(router.stack));
    assert.equal(indexExport, router);

    const routeLayers = router.stack.filter((layer) => layer.route);
    assert.equal(routeLayers.length, 10, 'Exactly 10 coupon routes must be registered');

    const expectedRoutes = [
      { method: 'POST', path: '/coupons', handler: createCouponStub },
      { method: 'POST', path: '/coupons/upload-image', handler: uploadCouponImageStub },
      { method: 'POST', path: '/coupons/delete-image', handler: deleteOrphanedCouponImageStub },
      { method: 'GET', path: '/coupons', handler: getAllCouponsStub },
      { method: 'GET', path: '/coupons-stats', handler: getCouponUsageStatsStub },
      { method: 'GET', path: '/coupons/:id/analytics', handler: getCouponAnalyticsStub },
      { method: 'GET', path: '/coupons/:id', handler: getCouponByIdStub },
      { method: 'PUT', path: '/coupons/:id', handler: updateCouponStub },
      { method: 'DELETE', path: '/coupons/:id', handler: deleteCouponStub },
      { method: 'PATCH', path: '/coupons/:id/toggle-status', handler: toggleCouponStatusStub },
    ];

    const seenSignatures = new Set();

    routeLayers.forEach((layer, index) => {
      const expected = expectedRoutes[index];
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      const actualMethod = methods[0];
      const actualPath = layer.route.path;

      assert.equal(actualMethod, expected.method, `Route index ${index} method mismatch`);
      assert.equal(actualPath, expected.path, `Route index ${index} path mismatch`);

      const sig = `${actualMethod} ${actualPath}`;
      assert.ok(!seenSignatures.has(sig), `Duplicate route signature: ${sig}`);
      seenSignatures.add(sig);

      const handlers = layer.route.stack.map((s) => s.handle);
      assert.equal(handlers.length, 2, `Route ${sig} must have exactly 2 handlers`);
      assert.equal(handlers[0], adminMiddlewareStub, `Route ${sig} missing adminMiddleware`);
      assert.equal(handlers[1], expected.handler, `Route ${sig} has wrong controller handler`);
    });
  } finally {
    if (oldMiddlewareCache) require.cache[middlewarePath] = oldMiddlewareCache;
    else delete require.cache[middlewarePath];

    if (oldControllerCache) require.cache[controllerPath] = oldControllerCache;
    else delete require.cache[controllerPath];

    if (oldAnalyticsCache) require.cache[analyticsPath] = oldAnalyticsCache;
    else delete require.cache[analyticsPath];

    if (oldStatisticsCache) require.cache[statisticsPath] = oldStatisticsCache;
    else delete require.cache[statisticsPath];

    if (oldRoutesCache) require.cache[routesPath] = oldRoutesCache;
    else delete require.cache[routesPath];

    if (oldIndexCache) require.cache[indexPath] = oldIndexCache;
    else delete require.cache[indexPath];
  }
});
