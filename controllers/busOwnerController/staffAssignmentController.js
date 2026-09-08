"use strict";
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../../models/userModel");
const DriverProfile = require("../../models/driverProfileModel");
const ConductorProfile = require("../../models/conductorProfileModel");
const OperatorBrand = require("../../models/operatorBrandModel");
const logger = require("../../utils/logger");
const storage = require("../../services/s3Service");
const { createDriverDocumentService } = require("../../src/modules/admin/driver-management/driver-documents.service");
const { createCrewAssignmentService } = require("../../src/modules/bus-owner/crew/crew-assignment.service");
const { createCrewController } = require("../../src/modules/bus-owner/crew/crew.controller");

const driverDocuments = createDriverDocumentService({ storage, DriverProfile, logger });
const assignmentService = createCrewAssignmentService({
  mongoose, User, DriverProfile, ConductorProfile, OperatorBrand, logger,
  driverDocuments,
  hashPassword: value => bcrypt.hash(value, 12),
  randomPassword: () => crypto.randomBytes(32).toString("base64url"),
  sendSMS: require("../../handlers/sparro-otp"),
});
const { createConductorTripController } = require("../../src/modules/bus-owner/crew/conductor-trip.controller");
const { createCrewDirectoryController } = require("../../src/modules/bus-owner/crew/crew-directory.controller");
module.exports = {
  ...createCrewController({ assignmentService, DriverProfile, ConductorProfile, logger }),
  ...createConductorTripController({ Trip: require("../../models/tripModel"), ConductorProfile, logger }),
  ...createCrewDirectoryController({ DriverProfile, ConductorProfile, logger }),
};
