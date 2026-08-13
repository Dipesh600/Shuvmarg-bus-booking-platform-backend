"use strict";

const repository = require("./seat-layout.repository");
const fleetRepository = require("./fleet-seat-layout.repository");
const snapshotRepository = require("./trip-seat-layout-snapshot.repository");
const queryRepository = require("./seat-layout-query.repository");
const dualWriteRepository = require("./trip-seat-layout-dual-write.repository");
const { createSeatLayoutTemplateService } = require("./seat-layout-template.service");
const { createFleetSeatLayoutService } = require("./fleet-seat-layout.service");
const { createTripSeatLayoutSnapshotService } = require("./trip-seat-layout-snapshot.service");
const { createSeatLayoutQueryService } = require("./seat-layout-query.service");
const { createTripSeatLayoutDualWriteService } = require("./trip-seat-layout-dual-write.service");
const { createAdminSeatLayoutController } = require("./admin-seat-layout.controller");
const { createBusOwnerSeatLayoutController } = require("./bus-owner-seat-layout.controller");

const services = {
  templates: createSeatLayoutTemplateService(repository),
  fleets: createFleetSeatLayoutService(fleetRepository),
  snapshots: createTripSeatLayoutSnapshotService(snapshotRepository),
  query: createSeatLayoutQueryService(queryRepository),
};
services.dualWrite = createTripSeatLayoutDualWriteService(dualWriteRepository, services.snapshots);

module.exports = {
  seatLayoutTemplateService: services.templates,
  fleetSeatLayoutService: services.fleets,
  tripSeatLayoutSnapshotService: services.snapshots,
  seatLayoutQueryService: services.query,
  tripSeatLayoutDualWriteService: services.dualWrite,
  adminSeatLayoutController: createAdminSeatLayoutController(services),
  busOwnerSeatLayoutController: createBusOwnerSeatLayoutController(services),
};
