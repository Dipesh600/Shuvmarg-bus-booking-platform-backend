"use strict";

const defaultBusSchedule = require("../../../../models/busScheduleModel.js");

const createBusOwnerScheduleRepository = ({
  BusSchedule = defaultBusSchedule,
} = {}) => ({
  createSchedule(data) {
    return BusSchedule.create(data);
  },
  findScheduleById(scheduleId) {
    return BusSchedule.findById(scheduleId);
  },
  saveSchedule(schedule) {
    return schedule.save();
  },
  deleteScheduleById(scheduleId) {
    return BusSchedule.findByIdAndDelete(scheduleId);
  },
});

module.exports = {
  createBusOwnerScheduleRepository,
  defaultRepository: createBusOwnerScheduleRepository(),
};
