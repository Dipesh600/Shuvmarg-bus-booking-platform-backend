'use strict';

const User = require('../../../../../models/userModel');

const findUserByPhone = (phone) => User.findOne({ phone });
const saveUser = (user) => user.save();
const incrementTokenVersion = (userId) =>
  User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });

module.exports = {
  findUserByPhone,
  saveUser,
  incrementTokenVersion,
};
