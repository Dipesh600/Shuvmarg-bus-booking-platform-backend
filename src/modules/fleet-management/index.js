"use strict";

const Bus = require("../../../models/fleetModel");
const BusAmenities = require("../../../models/busAmenitiesModel");
const BoardingPoints = require("../../../models/boardingPointsModel");
const RouteRequest = require("../../../models/routeRequestModel");
const OperatorBrand = require("../../../models/operatorBrandModel");
const SeatLayoutVersion = require("../../../models/seatLayoutVersionModel");
const SeatTemplate = require("../../../models/seatTemplateModel");
const s3 = require("../../../services/s3Service");
const {
  createFleetDocumentMapper,
} = require("./fleet-document.mapper");
const {
  createFleetQueryRepository,
} = require("./fleet-query.repository");
const {
  createFleetQueryService,
} = require("./fleet-query.service");
const {
  createFleetCreationPolicy,
} = require("./fleet-creation.policy");
const {
  createFleetStorageService,
} = require("./fleet-storage.service");
const {
  createFleetCreationService,
} = require("./fleet-creation.service");
const {
  createFleetUpdatePolicy,
} = require("./fleet-update.policy");
const {
  createFleetUpdateService,
} = require("./fleet-update.service");
const {
  createFleetReviewService,
} = require("./fleet-review.service");

const mapper = createFleetDocumentMapper(s3);
const repository = createFleetQueryRepository({ Bus });
const storage = createFleetStorageService(s3);
const creationPolicy = createFleetCreationPolicy({
  Bus, BusAmenities, BoardingPoints, OperatorBrand, SeatLayoutVersion, SeatTemplate,
});
const creation = createFleetCreationService({
  Bus, RouteRequest, policy: creationPolicy, storage,
});
const updatePolicy = createFleetUpdatePolicy({
  Bus,
  getTripModel: () => require("../../../models/tripModel"),
  getSeatLayoutVersionModel: () => SeatLayoutVersion,
  getSeatTemplateModel: () => SeatTemplate,
});
const update = createFleetUpdateService({
  Bus, repository, policy: updatePolicy, storage, mapper,
});
const queries = createFleetQueryService({ repository, mapper });
const review = createFleetReviewService({ repository, storage, mapper });

module.exports = {
  ...creation,
  ...queries,
  ...update,
  ...review,
};
