"use strict";

const repository = require("./seat-layout.repository");
const fleetRepository = require("./fleet-seat-layout.repository");
const snapshotRepository = require("./trip-seat-layout-snapshot.repository");
const queryRepository = require("./seat-layout-query.repository");
const dualWriteRepository = require("./trip-seat-layout-dual-write.repository");
const controlRepository = require("./trip-seat-layout-control.repository");
const { createSeatLayoutTemplateService } = require("./seat-layout-template.service");
const { createFleetSeatLayoutService } = require("./fleet-seat-layout.service");
const { createTripSeatLayoutSnapshotService } = require("./trip-seat-layout-snapshot.service");
const { createSeatLayoutQueryService } = require("./seat-layout-query.service");
const { createTripSeatLayoutDualWriteService } = require("./trip-seat-layout-dual-write.service");
const { createTripSeatLayoutControlService } = require("./trip-seat-layout-control.service");
const { createAdminSeatLayoutController } = require("./admin-seat-layout.controller");
const { createBusOwnerSeatLayoutController } = require("./bus-owner-seat-layout.controller");
const { createTripSeatLayoutControlController } = require("./trip-seat-layout-control.controller");

const services = {
  templates: createSeatLayoutTemplateService(repository),
  fleets: createFleetSeatLayoutService(fleetRepository),
  snapshots: createTripSeatLayoutSnapshotService(snapshotRepository),
  query: createSeatLayoutQueryService(queryRepository),
  controls: createTripSeatLayoutControlService(controlRepository),
};
services.dualWrite = createTripSeatLayoutDualWriteService(dualWriteRepository, services.snapshots);

module.exports = {
  seatLayoutTemplateService: services.templates,
  fleetSeatLayoutService: services.fleets,
  tripSeatLayoutSnapshotService: services.snapshots,
  seatLayoutQueryService: services.query,
  tripSeatLayoutDualWriteService: services.dualWrite,
  tripSeatLayoutControlService: services.controls,
  adminSeatLayoutController: createAdminSeatLayoutController(services),
  busOwnerSeatLayoutController: createBusOwnerSeatLayoutController(services),
  tripSeatLayoutControlController: createTripSeatLayoutControlController(services.controls),
};
