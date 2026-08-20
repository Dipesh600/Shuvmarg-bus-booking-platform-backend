"use strict";

const mongoose = require("mongoose");

const meetingDetailsSchema = new mongoose.Schema({
  displayName: { type: String, trim: true, maxlength: 120, default: "" },
  counterNumber: { type: String, trim: true, maxlength: 80, default: "" },
  contactName: { type: String, trim: true, maxlength: 100, default: "" },
  contactPhone: { type: String, trim: true, maxlength: 30, default: "" },
  reportingInstructions: { type: String, trim: true, maxlength: 500, default: "" },
}, { _id: false });

const customBoardingPointSchema = new mongoose.Schema({
  clientKey: { type: String, required: true, trim: true, maxlength: 80 },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  counterNumber: { type: String, trim: true, maxlength: 60, default: "" },
  contactName: { type: String, trim: true, maxlength: 100, default: "" },
  contactPhone: { type: String, trim: true, maxlength: 30, default: "" },
  reportingInstructions: { type: String, trim: true, maxlength: 500, default: "" },
  landmark: { type: String, trim: true, maxlength: 200, default: "" },
  coordinates: {
    lat: { type: Number, min: -90, max: 90, default: null },
    lng: { type: Number, min: -180, max: 180, default: null },
  },
}, { _id: false });

const customEndpointSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 150, default: "" },
  coordinates: {
    lat: { type: Number, min: -90, max: 90, default: null },
    lng: { type: Number, min: -180, max: 180, default: null },
  },
  address: { type: String, trim: true, maxlength: 500, default: "" },
}, { _id: false });

const servedStopSchema = new mongoose.Schema({
  stopId: { type: mongoose.Schema.Types.ObjectId, ref: "Stop", required: true },
  sequence: { type: Number, min: 1, required: true },
  usage: { type: String, enum: ["PICKUP", "DROP", "BOTH"], required: true },
  boardingMode: {
    type: String, enum: ["STOP_FALLBACK", "BOARDING_LOCATIONS"],
    default: "STOP_FALLBACK",
  },
  boardingLocationIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "BoardingLocation" }],
  customBoardingPoints: { type: [customBoardingPointSchema], default: [] },
  meetingDetails: { type: meetingDetailsSchema, default: () => ({}) },
}, { _id: false });

const unresolvedPlaceSchema = new mongoose.Schema({
  clientKey: { type: String, required: true, trim: true, maxlength: 80 },
  name: { type: String, required: true, trim: true, maxlength: 150 },
  existingStopId: { type: mongoose.Schema.Types.ObjectId, ref: "Stop", default: null },
  insertAfterStopId: { type: mongoose.Schema.Types.ObjectId, ref: "Stop", default: null },
  coordinates: {
    lat: { type: Number, min: -90, max: 90, default: null },
    lng: { type: Number, min: -180, max: 180, default: null },
  },
  address: { type: String, trim: true, maxlength: 500, default: "" },
  usage: { type: String, enum: ["PICKUP", "DROP", "BOTH"], default: "BOTH" },
  customBoardingPoints: { type: [customBoardingPointSchema], default: [] },
  meetingDetails: { type: meetingDetailsSchema, default: () => ({}) },
  reviewStatus: { type: String, enum: ["PENDING", "MATCHED", "APPROVED", "REJECTED"], default: "PENDING" },
}, { _id: false });

const fleetRouteSetupSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: "OperatorBrand", required: true, index: true },
  fleetId: { type: mongoose.Schema.Types.ObjectId, ref: "Bus", required: true, unique: true },
  originStopId: { type: mongoose.Schema.Types.ObjectId, ref: "Stop", default: null },
  destinationStopId: { type: mongoose.Schema.Types.ObjectId, ref: "Stop", default: null },
  customOrigin: { type: customEndpointSchema, default: null },
  customDestination: { type: customEndpointSchema, default: null },
  corridorId: { type: mongoose.Schema.Types.ObjectId, ref: "RouteCorridor", default: null },
  variantId: { type: mongoose.Schema.Types.ObjectId, ref: "RouteVariant", default: null },
  returnVariantId: { type: mongoose.Schema.Types.ObjectId, ref: "RouteVariant", default: null },
  direction: { type: String, enum: ["FORWARD", "RETURN"], default: null },
  servedStops: { type: [servedStopSchema], default: [] },
  unresolvedPlaces: { type: [unresolvedPlaceSchema], default: [] },
  returnEnabled: { type: Boolean, default: true },
  resolutionStatus: {
    type: String, enum: ["AVAILABLE", "NEEDS_PLATFORM_REVIEW"], required: true,
  },
  status: {
    type: String, enum: ["DRAFT", "READY", "PENDING_REVIEW", "APPROVED"], default: "DRAFT",
  },
  revision: { type: Number, min: 1, default: 1 },
}, { timestamps: true });

fleetRouteSetupSchema.index({ brandId: 1, variantId: 1, status: 1 });

module.exports = mongoose.model("FleetRouteSetup", fleetRouteSetupSchema);
