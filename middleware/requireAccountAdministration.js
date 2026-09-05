'use strict';
const logger = require('../utils/logger');

// Must follow adminMiddleware, which checks the current administrator record.
module.exports = (req, res, next) => {
  if (!req.adminInfo?.id || !['SUPER_ADMIN', 'ADMIN'].includes(req.adminInfo.role)) {
    return res.status(403).json({ success: false,
      message: 'Your staff account cannot change user credentials or grant account roles.',
      errorCode: 'ACCOUNT_ADMINISTRATION_FORBIDDEN' });
  }
  res.once('finish', () => logger.info('Account administration request completed', {
    event: 'account_administration', administratorId: req.adminInfo.id,
    administratorRole: req.adminInfo.role, method: req.method,
    route: `${req.baseUrl || ''}${req.route?.path || req.path || ''}`,
    statusCode: res.statusCode, requestId: req.id || req.requestId,
  }));
  return next();
};
