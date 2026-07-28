const User = require('../../../../models/userModel');

const incrementTokenVersion = async (userId) => {
  return User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });
};

module.exports = {
  incrementTokenVersion,
};
