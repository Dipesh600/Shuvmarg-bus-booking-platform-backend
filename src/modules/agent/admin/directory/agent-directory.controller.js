'use strict';

const asyncHandler = require('../../../../shared/http/async-handler');
const respond = require('../../../../shared/http/respond');
const service = require('./agent-directory.service');

const getAgentsById = asyncHandler(async (req, res) => {
  try {
    const result = await service.getAgentsById({ id: req.body.id });
    return respond(res, result.statusCode, result.body);
  } catch (error) {
    console.error('getAgentsById error:', error);
    return respond(res, 500, {
      success: false,
      message: 'Internal Server Error!',
    });
  }
});

const getAllAgents = asyncHandler(async (req, res) => {
  try {
    const result = await service.getAllAgents({
      status: req.query.status,
      type: req.query.type,
    });
    return respond(res, result.statusCode, result.body);
  } catch (error) {
    console.error('getAllAgents error:', error);
    return respond(res, 500, {
      success: false,
      message: 'Internal Server Error!',
    });
  }
});

module.exports = {
  getAgentsById,
  getAllAgents,
};
