'use strict';

const AppError = require('../../../shared/errors/app-error');
const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const { service } = require('./driver-profile.service');

const getProfile = asyncHandler(async (req, res) => {
  const userId = req.userInfo?.id;
  if (!userId) {
    return respond(res, 401, { success: false, message: 'Unauthorized.' });
  }

  try {
    const result = await service.getProfile(userId);
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    if (error instanceof AppError) {
      return respond(res, error.statusCode, error.responseBody);
    }
    console.error('[Driver profile] Error:', error.message);
    return respond(res, 500, {
      success: false,
      message: 'Internal Server Error',
    });
  }
});

module.exports = { getProfile };
