const sessionController = require('./session.controller');

module.exports = {
  refreshAccessToken: sessionController.refreshAccessToken,
  logout: sessionController.logout,
};
