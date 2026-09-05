"use strict";
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../../models/userModel");
const DriverProfile = require("../../models/driverProfileModel");
const ConductorProfile = require("../../models/conductorProfileModel");
const OperatorBrand = require("../../models/operatorBrandModel");
const logger = require("../../utils/logger");
const { createCrewAssignmentService } = require("../../src/modules/bus-owner/crew/crew-assignment.service");
const { createAdminConductorController } = require("../../src/modules/admin/conductor-management/conductor.controller");

const assignmentService = createCrewAssignmentService({ mongoose, User, DriverProfile, ConductorProfile,
  OperatorBrand, logger, hashPassword: value => bcrypt.hash(value, 12),
  randomPassword: () => crypto.randomBytes(32).toString("base64url"),
  sendSMS: require("../../handlers/sparro-otp") });

module.exports = createAdminConductorController({ ConductorProfile, OperatorBrand, assignmentService, logger });
