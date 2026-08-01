"use strict";

const repository = require("./passenger-boarding-options.repository.js");
const {
  createPassengerBoardingOptionsService,
} = require("./passenger-boarding-options.service.js");
const {
  createPassengerBoardingOptionsController,
} = require("./passenger-boarding-options.controller.js");

const resolvePassengerBoardingOptions =
  createPassengerBoardingOptionsService(repository);
const getPassengerBoardingOptions =
  createPassengerBoardingOptionsController(resolvePassengerBoardingOptions);

module.exports = {
  getPassengerBoardingOptions,
  resolvePassengerBoardingOptions,
};
