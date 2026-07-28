'use strict';

const asyncHandler = require('../../../../shared/http/async-handler');
const respond = require('../../../../shared/http/respond');
const fields = require('./agent-setup-fields');
const service = require('./agent-setup.service');

const setupData = (body) => {
  const data = {};
  for (const field of fields.REQUEST_FIELDS) data[field] = body[field];
  return data;
};

const finalizeAgentSetup = asyncHandler(async (req, res) => {
  try {
    const result = await service.finalizeAgentSetup({
      data: setupData(req.body),
      adminId: req.adminInfo?.id || null,
    });
    return respond(res, result.statusCode, result.body);
  } catch (error) {
    console.error('finalizeAgentSetup error:', error);
    return respond(res, 500, { success: false, message: 'Internal Server Error!' });
  }
});

module.exports = {
  finalizeAgentSetup,
};
