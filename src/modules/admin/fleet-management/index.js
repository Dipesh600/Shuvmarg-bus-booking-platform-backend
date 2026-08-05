"use strict";

const mongoose = require("mongoose");
const Bus = require("../../../../models/fleetModel");
const Trip = require("../../../../models/tripModel");
const Schedule = require("../../../../models/scheduleModel");
const DriverProfile = require("../../../../models/driverProfileModel");
const OperatorRouteConfig = require(
  "../../../../models/operatorRouteConfigModel"
);
const RouteVariant = require("../../../../models/routeVariantModel");
const UserDeviceInfo = require("../../../../models/userDeviceInfoModel");
const emailManager = require("../../../../emailManager/emailManager");
const {
  notificationManager,
  createLocalNotification,
} = require(
  "../../../../controllers/notificationController/notification_manager"
);
const sendOTP = require("../../../../handlers/sparro-otp");
const { resolveAuthorizedAdminActor } = require("../bus-owner-management/admin-actor.resolver");
const { buildFleetApprovalAuditEvent } = require("./fleet-approval-audit.builder");
const queryPolicy = require("./fleet-query.policy");
const statusPolicy = require("./fleet-status.policy");
const { mapFleet } = require("./fleet-list.mapper");
const { createFleetRepository } = require("./fleet.repository");
const {
  createFleetSetupRepository,
} = require("./fleet-setup.repository");
const { createFleetListService } = require("./fleet-list.service");
const { createFleetDetailService } = require("./fleet-detail.service");
const { createFleetSetupService } = require("./fleet-setup.service");
const { createFleetApprovalService } = require("./fleet-status.service");
const {
  createFleetNotificationService,
} = require("./fleet-notification.service");
const {
  createFleetDashboardService,
} = require("./fleet-dashboard.service");
const {
  createFleetManagementController,
} = require("./fleet-management.controller");

const repository = createFleetRepository({ Bus, Trip, Schedule });
const setupRepository = createFleetSetupRepository({
  Bus,
  RouteVariant,
  OperatorRouteConfig,
  DriverProfile,
  Schedule,
});
const notify = createFleetNotificationService({
  UserDeviceInfo,
  emailManager,
  notificationManager,
  createLocalNotification,
  sendOTP,
  console,
  policy: statusPolicy,
});

const approvalService = createFleetApprovalService({
  repository,
  resolveAuthorizedAdminActor,
  buildFleetApprovalAuditEvent,
  notify,
  clock: () => new Date(),
  logger: console,
});

module.exports = createFleetManagementController({
  listFleets: createFleetListService({
    repository,
    policy: queryPolicy,
    mapper: { mapFleet },
  }),
  getFleetDetail: createFleetDetailService({ mongoose, repository }),
  updateFleetStatus: approvalService.decideFleetApproval,
  getFleetDashboard: createFleetDashboardService({ repository }),
  getFleetSetupStatus: createFleetSetupService({
    repository: setupRepository,
  }),
  console,
});
