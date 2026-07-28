'use strict';

const asyncHandler = require('../../../../shared/http/async-handler');
const respond = require('../../../../shared/http/respond');
const service = require('./agent-conversion.service');

const makeUserAgent = asyncHandler(async (req, res) => {
  try {
    const result = await service.makeUserAgent({ id: req.body.id });
    return respond(res, result.statusCode, result.body);
  } catch (error) {
    console.error('makeUserAgent error:', error);
    return respond(res, 500, {
      success: false,
      message: 'Internal Server Error!',
    });
  }
});

module.exports = {
  makeUserAgent,
};
