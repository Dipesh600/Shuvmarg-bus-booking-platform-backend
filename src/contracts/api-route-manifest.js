"use strict";

const FRONTEND_READ_ROUTES = Object.freeze({
  ADMIN_BUS_OWNER_LIST: Object.freeze({
    key: "ADMIN_BUS_OWNER_LIST", method: "GET", path: "/api/admin/bus-owners",
    auth: ["adminMiddleware"], approvalRequired: false, pathParams: [],
    queryParams: ["page", "limit", "search", "verificationStatus", "status"],
    requestBody: false, successContract: "AdminBusOwnerListItem", errorContract: "CanonicalApiError",
    compatibilityAliases: Object.freeze([{ method: "GET", path: "/api/admin/getAllBusOwners" }]),
  }),
  ADMIN_BUS_OWNER_DETAIL: Object.freeze({
    key: "ADMIN_BUS_OWNER_DETAIL", method: "GET", path: "/api/admin/bus-owners/:ownerId",
    auth: ["adminMiddleware"], approvalRequired: false, pathParams: ["ownerId"], queryParams: [],
    requestBody: false, successContract: "AdminBusOwnerDetail", errorContract: "CanonicalApiError",
    compatibilityAliases: Object.freeze([{ method: "POST", path: "/api/admin/getBusOwnerDetails" }]),
  }),
  ADMIN_KYC_LIST: Object.freeze({
    key: "ADMIN_KYC_LIST", method: "GET", path: "/api/admin/bus-owner-kycs",
    auth: ["adminMiddleware"], approvalRequired: false, pathParams: [],
    queryParams: ["page", "limit", "search", "verificationStatus"],
    requestBody: false, successContract: "AdminKycListItem", errorContract: "CanonicalApiError",
    compatibilityAliases: Object.freeze([{ method: "GET", path: "/api/admin/getAllBusOwnerKycs" }]),
  }),
  ADMIN_KYC_DETAIL: Object.freeze({
    key: "ADMIN_KYC_DETAIL", method: "GET", path: "/api/admin/bus-owner-kycs/:kycId",
    auth: ["adminMiddleware"], approvalRequired: false, pathParams: ["kycId"], queryParams: [],
    requestBody: false, successContract: "AdminKycDetail", errorContract: "CanonicalApiError",
    compatibilityAliases: Object.freeze([{ method: "POST", path: "/api/admin/getBusOwnerKycDetails" }]),
  }),
  ADMIN_FLEET_LIST: Object.freeze({
    key: "ADMIN_FLEET_LIST", method: "GET", path: "/api/admin/fleets",
    auth: ["adminMiddleware"], approvalRequired: false, pathParams: [],
    queryParams: ["page", "limit", "search", "status", "approvalStatus", "ownerId"],
    requestBody: false, successContract: "AdminFleetListItem", errorContract: "CanonicalApiError",
    compatibilityAliases: Object.freeze([{ method: "GET", path: "/api/admin/fleet/getAllFleet" }]),
  }),
  ADMIN_FLEET_DETAIL: Object.freeze({
    key: "ADMIN_FLEET_DETAIL", method: "GET", path: "/api/admin/fleets/:fleetId",
    auth: ["adminMiddleware"], approvalRequired: false, pathParams: ["fleetId"], queryParams: [],
    requestBody: false, successContract: "AdminFleetDetail", errorContract: "CanonicalApiError",
    compatibilityAliases: Object.freeze([
      { method: "GET", path: "/api/admin/fleet/getById/:id" },
      { method: "GET", path: "/api/admin/fleet/details/:id", isLegacyNotRecommended: true },
    ]),
  }),
  ADMIN_FLEET_SETUP_STATUS: Object.freeze({
    key: "ADMIN_FLEET_SETUP_STATUS", method: "GET", path: "/api/admin/fleets/:fleetId/setup-status",
    auth: ["adminMiddleware"], approvalRequired: false, pathParams: ["fleetId"], queryParams: [],
    requestBody: false, successContract: "FleetSetupStatus", errorContract: "CanonicalApiError",
    compatibilityAliases: Object.freeze([{ method: "GET", path: "/api/admin/fleet/:id/setup-status" }]),
  }),
  BUS_OWNER_PROFILE: Object.freeze({
    key: "BUS_OWNER_PROFILE", method: "GET", path: "/api/busowner/profile",
    auth: ["auth", "verifyRoleFromDB", "busOwnerMiddleware"], approvalRequired: false, pathParams: [],
    queryParams: [], requestBody: false, successContract: "BusOwnerProfile", errorContract: "CanonicalApiError",
    compatibilityAliases: Object.freeze([]),
  }),
  BUS_OWNER_KYC_STATUS: Object.freeze({
    key: "BUS_OWNER_KYC_STATUS", method: "GET", path: "/api/busowner/kyc-status",
    auth: ["auth", "verifyRoleFromDB", "busOwnerMiddleware"], approvalRequired: false, pathParams: [],
    queryParams: [], requestBody: false, successContract: "BusOwnerKycStatus", errorContract: "CanonicalApiError",
    compatibilityAliases: Object.freeze([{ method: "GET", path: "/api/busowner/myBusOwnerKycStatus" }]),
  }),
  BUS_OWNER_FLEET_LIST: Object.freeze({
    key: "BUS_OWNER_FLEET_LIST", method: "GET", path: "/api/busowner/fleets",
    auth: ["auth", "verifyRoleFromDB", "busOwnerMiddleware", "requireApprovedBusOwner"], approvalRequired: true, pathParams: [],
    queryParams: ["page", "limit", "search", "status"], requestBody: false,
    successContract: "BusOwnerFleetListItem", errorContract: "CanonicalApiError",
    compatibilityAliases: Object.freeze([{ method: "GET", path: "/api/busowner/myFleets" }]),
  }),
  BUS_OWNER_FLEET_DETAIL: Object.freeze({
    key: "BUS_OWNER_FLEET_DETAIL", method: "GET", path: "/api/busowner/fleets/:fleetId",
    auth: ["auth", "verifyRoleFromDB", "busOwnerMiddleware", "requireApprovedBusOwner"], approvalRequired: true, pathParams: ["fleetId"],
    queryParams: [], requestBody: false, successContract: "BusOwnerFleetDetail", errorContract: "CanonicalApiError",
    compatibilityAliases: Object.freeze([{ method: "POST", path: "/api/busowner/getFleetById" }]),
  }),
  STATUS_METADATA: Object.freeze({
    key: "STATUS_METADATA", method: "GET", path: "/api/contracts/statuses",
    auth: [], approvalRequired: false, pathParams: [], queryParams: [], requestBody: false,
    successContract: "StatusMetadata", errorContract: "CanonicalApiError", compatibilityAliases: Object.freeze([]),
  }),
});

const busOwnerFleet = Object.freeze({
  list: Object.freeze({
    method: "GET",
    path: "/api/busowner/fleets",
    aliases: Object.freeze(["/api/busowner/myFleets"]),
  }),
  detail: Object.freeze({
    method: "GET",
    path: "/api/busowner/fleets/:fleetId",
    aliases: Object.freeze(["/api/busowner/getFleetById"]),
  }),
  create: Object.freeze({
    method: "POST",
    path: "/api/busowner/fleets",
    aliases: Object.freeze(["/api/busowner/submitFleetForVerification"]),
  }),
  update: Object.freeze({
    method: "PATCH",
    path: "/api/busowner/fleets/:fleetId",
    aliases: Object.freeze(["/api/busowner/updateFleet"]),
  }),
  delete: Object.freeze({
    method: "DELETE",
    path: "/api/busowner/fleets/:fleetId",
    aliases: Object.freeze(["/api/busowner/deleteFleet"]),
  }),
});

module.exports = { FRONTEND_READ_ROUTES, busOwnerFleet };
