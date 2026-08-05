"use strict";

const { createAdminBusOwnerReadService } = require("../../read-contracts/admin-bus-owner/admin-bus-owner-read.service");
const { mapReadError } = require("../../read-contracts/common/read-error.mapper");

const defaultService = createAdminBusOwnerReadService();

const getAllBusOwners = async (req, res) => {
  try {
    const result = await defaultService.listBusOwners(req);
    return res.status(200).json(result);
  } catch (error) {
    const { statusCode, payload } = mapReadError(error);
    return res.status(statusCode).json(payload);
  }
};

const getBusOwnerById = async (req, res) => {
  try {
    const result = await defaultService.getBusOwnerDetail(req);
    return res.status(200).json(result);
  } catch (error) {
    const { statusCode, payload } = mapReadError(error);
    return res.status(statusCode).json(payload);
  }
};

module.exports = { getAllBusOwners, getBusOwnerById };
