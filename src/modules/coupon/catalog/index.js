'use strict';

const {
  getAllCouponsForUser,
  getAllCouponsIncludingExpired,
} = require('./coupon-catalog.controller.js');

module.exports = {
  getAllCouponsForUser,
  getAllCouponsIncludingExpired,
};
