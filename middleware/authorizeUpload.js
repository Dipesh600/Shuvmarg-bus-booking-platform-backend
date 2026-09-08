'use strict';
const auth = require('./authMiddleware');
const verifyRoleFromDB = require('./verifyRoleFromDB');
const admin = require('./adminMiddleware');

// No anonymous endpoint needs files. Authenticate before buffering a multipart
// request; individual routes still enforce their role and record permissions.
module.exports = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  if (req.path.startsWith('/api/public/') || req.path.startsWith('/api/auth/')) {
    return res.status(415).json({ success: false, message: 'This endpoint accepts JSON requests.' });
  }
  if (req.path.startsWith('/api/admin/')) return admin(req, res, next);
  return auth(req, res, () => verifyRoleFromDB(req, res, next));
};
