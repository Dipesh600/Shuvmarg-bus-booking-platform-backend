'use strict';

const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const service = require('./update-password.service');

exports.updatePassword = asyncHandler(async (req, res) => {
  const userId = req.userInfo?.id;
  const { oldPassword, newPassword } = req.body;

  const result = await service.updatePassword({
    userId,
    oldPassword,
    newPassword,
  });

  return respond(res, result.statusCode, result.responseBody);
});
