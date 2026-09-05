'use strict';
const AppError = require('../errors/app-error');

const availableAccountFilter = id => ({
  _id: id, status: 'active', deletedAt: null, forcePasswordChange: { $ne: true },
});
const requireRoleGrantResult = user => {
  if (!user) throw new AppError('Account unavailable for role grant', 403, {
    success: false, message: 'This account cannot add a role right now. Please sign in or contact support.',
    errorCode: 'ACCOUNT_UNAVAILABLE',
  });
  return user;
};
module.exports = { availableAccountFilter, requireRoleGrantResult };
