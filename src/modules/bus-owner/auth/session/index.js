'use strict';

const controller = require('./bus-owner-session.controller');

module.exports = {
  refresh: controller.refresh,
  logout: controller.logout,
};
