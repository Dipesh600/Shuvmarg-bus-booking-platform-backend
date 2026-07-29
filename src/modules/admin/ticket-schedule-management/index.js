"use strict";

module.exports = {
  ...require("./bus-route-read.controller.js"),
  ...require("./bus-route-write.controller.js"),
  ...require("./ticket-schedule-read.controller.js"),
  ...require("./ticket-schedule-write.controller.js"),
};
