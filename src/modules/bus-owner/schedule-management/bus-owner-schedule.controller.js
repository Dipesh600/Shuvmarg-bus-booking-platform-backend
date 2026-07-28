"use strict";

const { ScheduleError } = require("./bus-owner-schedule.errors");

const createBusOwnerScheduleController = ({ service }) => {
  const createSchedule = async (req, res) => {
    try {
      const newSchedule = await service.createSchedule({
        body: req.body,
        userInfo: req.userInfo,
      });
      return res.status(201).json({
        status: true,
        message: "Bus ticket created!",
        data: newSchedule,
      });
    } catch (e) {
      if (e instanceof ScheduleError) {
        return res.status(e.statusCode).json({ status: false, message: e.message });
      }
      console.error(e);
      return res.status(500).json({
        status: false,
        message: "Internal Server Error!",
      });
    }
  };

  const updateSchedule = async (req, res) => {
    try {
      const ticket = await service.updateSchedule({
        body: req.body,
        userInfo: req.userInfo,
        files: req.files,
      });
      return res.status(200).json({
        status: true,
        message: "Ticket updated successfully!",
        data: ticket,
      });
    } catch (error) {
      if (error instanceof ScheduleError) {
        return res.status(error.statusCode).json({ status: false, message: error.message });
      }
      console.error(error);
      return res
        .status(500)
        .json({ status: false, message: "Internal Server Error" });
    }
  };

  const deleteSchedule = async (req, res) => {
    try {
      await service.deleteSchedule({
        ticketId: req.body.ticketId,
        userInfo: req.userInfo,
      });
      return res.status(200).json({
        status: true,
        message: "Ticket deleted successfully!",
      });
    } catch (error) {
      if (error instanceof ScheduleError) {
        return res.status(error.statusCode).json({ status: false, message: error.message });
      }
      console.error(error);
      return res
        .status(500)
        .json({ status: false, message: "Internal Server Error" });
    }
  };

  const getScheduleById = async (req, res) => {
    try {
      const ticket = await service.getScheduleById({
        ticketId: req.body.ticketId,
        userInfo: req.userInfo,
      });
      return res.status(200).json({
        status: true,
        message: "Ticket fetched successfully!",
        data: ticket,
      });
    } catch (error) {
      if (error instanceof ScheduleError) {
        return res.status(error.statusCode).json({ status: false, message: error.message });
      }
      console.error(error);
      return res.status(500).json({
        status: false,
        message: "Internal Server Error.",
      });
    }
  };

  return {
    createSchedule,
    updateSchedule,
    deleteSchedule,
    getScheduleById,
  };
};

module.exports = {
  createBusOwnerScheduleController,
};
