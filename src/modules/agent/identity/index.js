'use strict';

const controller = require('./agent-identity.controller');

module.exports = {
  getCode: controller.getCode,
  getIdentity: controller.getIdentity,
  updateIdentity: controller.updateIdentity,
};
