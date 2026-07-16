const sessionController = require('./session.controller');
const sessionService = require('./session.service');

module.exports = {
  refreshAccessToken: sessionController.refreshAccessToken,
  logout: sessionController.logout,
  sessionService, // Expose service for potential internal use
};
