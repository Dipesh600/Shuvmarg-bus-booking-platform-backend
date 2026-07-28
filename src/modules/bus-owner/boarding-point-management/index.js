"use strict";

const boardingPointService = require("../../../../services/boardingPointService");
const {
  createBoardingPointController,
} = require("./boarding-point.controller");

module.exports = createBoardingPointController({ boardingPointService });
