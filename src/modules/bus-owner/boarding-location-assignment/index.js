"use strict";

const { createBoardingAssignmentController } = require(
  "./boarding-location-assignment.controller.js"
);
const assignmentService = require("./boarding-assignment.service.js");
const catalogService = require("./boarding-location-catalog.service.js");
const requestService = require("./boarding-location-request.service.js");
const brandService = require("./brand-ownership.policy.js");

module.exports = createBoardingAssignmentController({
  ...assignmentService, ...catalogService, ...requestService, ...brandService,
});
