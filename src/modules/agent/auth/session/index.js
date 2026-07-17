'use strict';

const controller = require('./agent-session.controller');

module.exports = {
  refresh: controller.refresh,
  logout: controller.logout,
};
