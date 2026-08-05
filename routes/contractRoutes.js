"use strict";

const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware.js");
const verifyRoleFromDB = require("../middleware/verifyRoleFromDB.js");
const { defaultController } = require("../src/modules/contract-metadata/contract-metadata.controller");

router.get("/statuses", auth, verifyRoleFromDB, defaultController.getStatuses);

module.exports = router;
