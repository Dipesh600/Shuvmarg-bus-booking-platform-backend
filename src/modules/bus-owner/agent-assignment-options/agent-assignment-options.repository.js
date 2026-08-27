'use strict';

const OperatorBrand = require('../../../../models/operatorBrandModel');
const Schedule = require('../../../../models/scheduleModel');

const findOwnedBrand = (ownerId, brandId) => OperatorBrand
  .findOne({ _id: brandId, ownerId })
  .select('brandName')
  .lean();

const findActiveSchedules = (ownerId, brandId) => Schedule.find({
  ownerId,
  brandId,
  status: 'ACTIVE',
}).select('_id variantId busId departureTime arrivalTime recurrence daysOfWeek')
  .populate({ path: 'variantId', select: 'code name direction' })
  .populate({ path: 'busId', select: 'busName busNumber' })
  .sort({ departureTime: 1, _id: 1 })
  .lean();

module.exports = { findActiveSchedules, findOwnedBrand };
