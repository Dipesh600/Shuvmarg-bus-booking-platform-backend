"use strict";

const mongoose = require("mongoose");
const Coupon = require("../../../../../models/couponModel.js");
const CouponUsage = require("../../../../../models/couponUsageModel.js");
const User = require("../../../../../models/userModel.js");
const UserDeviceInfo = require("../../../../../models/userDeviceInfoModel.js");
const CouponHelper = require("../../../../../handlers/couponHelper.js");
const s3Service = require("../../../../../services/s3Service.js");
const {
  notificationManager,
  createLocalNotification,
} = require(
  "../../../../../controllers/notificationController/notification_manager.js"
);
const policy = require("./coupon-write.policy");
const imageKeyPolicy = require("./coupon-image-key.policy");
const writeMapper = require("./coupon-write.mapper");
const readMapper = require("./coupon-read.mapper");
const {
  createCouponWriteRepository,
} = require("./coupon-write.repository");
const { createCouponReadRepository } = require("./coupon-read.repository");
const {
  createCouponOfferNotificationService,
} = require("./coupon-offer-notification.service");
const { createCouponMediaService } = require("./coupon-media.service");
const { createCouponCreationService } = require("./coupon-create.service");
const { createCouponUpdateService } = require("./coupon-update.service");
const { createCouponStateService } = require("./coupon-state.service");
const { createCouponReadService } = require("./coupon-read.service");
const { createCouponMediaController } = require("./coupon-media.controller");
const { createCouponWriteController } = require("./coupon-write.controller");
const { createCouponReadController } = require("./coupon-read.controller");

const writeRepository = createCouponWriteRepository({ Coupon, CouponUsage });
const readRepository = createCouponReadRepository({ Coupon });
const notificationService = createCouponOfferNotificationService({
  User,
  UserDeviceInfo,
  notificationManager,
  createLocalNotification,
});
const offerNotification =
  notificationService.sendOfferNotificationToPassengers;
const mediaService = createCouponMediaService({
  ...s3Service,
  imageKeyPolicy,
});
const creationService = createCouponCreationService({
  repository: writeRepository,
  policy,
  mapper: writeMapper,
  offerNotification,
});
const updateService = createCouponUpdateService({
  repository: writeRepository,
  policy,
  imageKeyPolicy,
  mediaService,
  mapper: writeMapper,
});
const stateService = createCouponStateService({
  repository: writeRepository,
  offerNotification,
});
const readService = createCouponReadService({
  repository: readRepository,
  getCouponStats: CouponHelper.getCouponStats,
  getDisplayUrl: s3Service.getDisplayUrl,
  imageKeyPolicy,
  mapper: readMapper,
});
const isValidId = mongoose.Types.ObjectId.isValid;

module.exports = {
  ...createCouponWriteController({
    creationService,
    updateService,
    stateService,
    isValidId,
  }),
  ...createCouponReadController({ readService, isValidId }),
  ...createCouponMediaController({ mediaService }),
};
