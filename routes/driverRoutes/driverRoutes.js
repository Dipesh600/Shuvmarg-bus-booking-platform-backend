'use strict';

const express = require('express');
const auth = require('../../middleware/authMiddleware');
const verifyRoleFromDB = require('../../middleware/verifyRoleFromDB');
const { driverMiddleware } = require('../../middleware/checkRole');
const driverProfile = require('../../src/modules/driver/profile');

const router = express.Router();

/**
 * Driver workspace routes — /api/driver
 *
 * Driver identity is readable for every authenticated active Driver account.
 * Operational/access status is returned as data so the app can explain a
 * restriction; hiding the profile behind an approval gate would produce an
 * unusable blank workspace.
 */
router.get('/me', auth, verifyRoleFromDB, driverMiddleware, driverProfile.getProfile);

module.exports = router;
