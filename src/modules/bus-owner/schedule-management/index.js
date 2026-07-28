"use strict";

const { defaultRepository } = require("./bus-owner-schedule.repository");
const { defaultImageService } = require("./bus-owner-schedule-image.service");
const { assertOwnership } = require("./bus-owner-schedule.policy");
const { createBusOwnerScheduleService } = require("./bus-owner-schedule.service");
const { createBusOwnerScheduleController } = require("./bus-owner-schedule.controller");

const service = createBusOwnerScheduleService({
  repository: defaultRepository,
  ownershipPolicy: { assertOwnership },
  imageService: defaultImageService,
});

const controller = createBusOwnerScheduleController({ service });

module.exports = {
  createSchedule: controller.createSchedule,
  updateSchedule: controller.updateSchedule,
  deleteSchedule: controller.deleteSchedule,
  getScheduleById: controller.getScheduleById,
};
