"use strict";

const { emptyBodyError, missingFieldsError, notFoundError } = require("./bus-owner-schedule.errors");
const { assertOwnership: defaultAssertOwnership } = require("./bus-owner-schedule.policy");

const createBusOwnerScheduleService = ({
  repository,
  ownershipPolicy = { assertOwnership: defaultAssertOwnership },
  imageService,
}) => {
  const createSchedule = async ({ body, userInfo }) => {
    if (!body || Object.keys(body).length === 0) {
      throw emptyBodyError();
    }
    const {
      operatorName, bussName, vehicleType, departureTime, arrivalTime,
      date, from, to, routeId, price, totalSeats, bussNo,
      totalTimeTaken, shift, boardingPoints, amenities,
    } = body;
    console.log("my info", userInfo);
    console.log("My data", userInfo.role, userInfo.id);

    if (
      !operatorName || !bussName || !vehicleType || !departureTime ||
      !arrivalTime || !from || !to || !price || !totalSeats ||
      !bussNo || !totalTimeTaken || !shift
    ) {
      throw missingFieldsError();
    }

    const yatrapoints = Math.round(price * 0.1);
    return repository.createSchedule({
      operatorName, bussName, bussNo, vehicleType, departureTime,
      arrivalTime, date, route: { from, to },
      ...(routeId ? { routeId } : {}),
      price, yatrapoints, totalSeats, totalTimeTaken, shift,
      boardingPoints: boardingPoints || [],
      amenities: amenities || [],
      thumbnail: null,
      operatorId: userInfo.id,
      operatorRole: userInfo.role,
    });
  };

  const updateSchedule = async ({ body, userInfo, files }) => {
    const {
      operatorName, bussName, vehicleType, departureTime, arrivalTime,
      date, from, to, price, totalSeats, bussNo, totalTimeTaken, shift,
      ticketId, boardingPoints,
    } = body;

    const schedule = await repository.findScheduleById(ticketId);
    if (!schedule) throw notFoundError();

    ownershipPolicy.assertOwnership(schedule, userInfo.id, "update");

    if (files?.thumbnail) {
      schedule.thumbnail = await imageService.uploadThumbnail(files.thumbnail);
    }

    schedule.operatorName = operatorName || schedule.operatorName;
    schedule.bussName = bussName || schedule.bussName;
    schedule.vehicleType = vehicleType || schedule.vehicleType;
    schedule.departureTime = departureTime || schedule.departureTime;
    schedule.arrivalTime = arrivalTime || schedule.arrivalTime;
    schedule.bussNo = bussNo || schedule.bussNo;
    schedule.date = date || schedule.date;
    schedule.route = { from: from || schedule.route.from, to: to || schedule.route.to };
    schedule.price = price || schedule.price;
    schedule.yatrapoints = price ? Math.round(price * 0.1) : schedule.yatrapoints;
    schedule.totalSeats = totalSeats || schedule.totalSeats;
    schedule.totalTimeTaken = totalTimeTaken || schedule.totalTimeTaken;
    schedule.shift = shift || schedule.shift;
    schedule.boardingPoints = boardingPoints !== undefined ? boardingPoints : schedule.boardingPoints;

    await repository.saveSchedule(schedule);
    return schedule;
  };

  const deleteSchedule = async ({ ticketId, userInfo }) => {
    const schedule = await repository.findScheduleById(ticketId);
    if (!schedule) throw notFoundError();
    ownershipPolicy.assertOwnership(schedule, userInfo.id, "delete");
    await repository.deleteScheduleById(ticketId);
  };

  const getScheduleById = async ({ ticketId, userInfo }) => {
    const schedule = await repository.findScheduleById(ticketId);
    if (!schedule) throw notFoundError();
    ownershipPolicy.assertOwnership(schedule, userInfo.id, "read");
    return schedule;
  };

  return { createSchedule, updateSchedule, deleteSchedule, getScheduleById };
};

module.exports = { createBusOwnerScheduleService };
