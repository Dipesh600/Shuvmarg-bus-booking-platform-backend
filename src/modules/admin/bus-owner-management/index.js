"use strict";

module.exports = {
  ...require("./owner-query.controller.js"),
  ...require("./owner-creation.controller.js"),
  ...require("./owner-profile.controller.js"),
  ...require("./owner-dashboard.controller.js"),
  ...require("./kyc-query.controller.js"),
  ...require("./kyc-review.controller.js"),
  ...require("./kyc-document.controller.js"),
};
