'use strict';

const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const service = require('./profile.service');

exports.updateProfilePicture = asyncHandler(async (req, res) => {
  const result = await service.updateProfilePicture({
    userId: req.userInfo?.id,
    profilePic: req.files?.profilePic,
  });

  return respond(res, result.statusCode, result.responseBody);
});

exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, address, gender } = req.body || {};
  const result = await service.updateProfile({
    userId: req.userInfo?.id,
    name,
    address,
    gender,
    profilePic: req.files?.profilePic,
  });

  return respond(res, result.statusCode, result.responseBody);
});

exports.getUserDetail = asyncHandler(async (req, res) => {
  const userId = req.userInfo.id;
  const result = await service.getUserDetail({ userId });

  return respond(res, result.statusCode, result.responseBody);
});
