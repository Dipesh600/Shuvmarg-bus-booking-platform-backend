"use strict";

const Coupon = require("../../../../models/couponModel");
const CouponUsage = require("../../../../models/couponUsageModel");
const UserCouponUsage = require("../../../../models/userCouponUsageModel");
const couponHelper = require("../../../../handlers/couponHelper");
const catalog = require("../catalog");
const policy = require("./passenger-coupon.policy");
const mapper = require("./passenger-coupon.mapper");
const {
  createPassengerCouponRepository,
} = require("./passenger-coupon.repository");
const {
  createCouponAvailabilityService,
} = require("./coupon-availability.service");
const {
  createCouponValidationService,
} = require("./coupon-validation.service");
const {
  createCouponHistoryService,
} = require("./coupon-history.service");
const { createCouponSearchService } = require("./coupon-search.service");
const {
  createPassengerCouponController,
} = require("./passenger-coupon.controller");

const repository = createPassengerCouponRepository({
  Coupon,
  CouponUsage,
  UserCouponUsage,
});
const controller = createPassengerCouponController({
  availability: createCouponAvailabilityService({ couponHelper }),
  validateCoupon: createCouponValidationService({
    repository,
    couponHelper,
    policy,
    mapper,
  }),
  getCouponHistory: createCouponHistoryService({ repository, mapper }),
  searchCoupons: createCouponSearchService({
    repository,
    policy,
    mapper,
    clock: () => new Date(),
  }),
  console,
});

module.exports = {
  ...controller,
  getAllCouponsForUser: catalog.getAllCouponsForUser,
  getAllCouponsIncludingExpired: catalog.getAllCouponsIncludingExpired,
};
