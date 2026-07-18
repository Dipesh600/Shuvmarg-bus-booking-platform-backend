'use strict';

const User = require('../../../../../models/userModel');

const incrementTokenVersion = (userId) => User.findByIdAndUpdate(
  userId,
  {
    $inc: {
      tokenVersion: 1,
    },
  },
);

module.exports = {
  incrementTokenVersion,
};
