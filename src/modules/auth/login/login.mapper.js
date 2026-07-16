'use strict';

exports.toUserResponse = (userDoc) => {
  const user = userDoc.toObject();
  delete user.password;
  return user;
};
