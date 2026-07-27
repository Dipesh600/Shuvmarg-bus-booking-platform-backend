"use strict";

const mongoose = require("mongoose");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const dayBounds = (date) => {
  const value = date ? new Date(date) : new Date();
  return {
    start: new Date(
      Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate(),
        0,
        0,
        0,
        0
      )
    ),
    end: new Date(
      Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate(),
        23,
        59,
        59,
        999
      )
    ),
  };
};

const buildBrandFilter = (brandId) =>
  brandId && isValidId(brandId)
    ? { brandId: new mongoose.Types.ObjectId(brandId) }
    : {};

const pagination = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, parseInt(query.limit) || 30);
  return { page, limit, skip: (page - 1) * limit };
};

const overviewWindow = (query, now = new Date()) => {
  const defaultFrom = new Date(now);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 7);
  const defaultTo = new Date(now);
  defaultTo.setUTCDate(defaultTo.getUTCDate() + 7);
  const from = query.from ? new Date(query.from) : defaultFrom;
  const to = query.to ? new Date(query.to) : defaultTo;
  from.setUTCHours(0, 0, 0, 0);
  to.setUTCHours(23, 59, 59, 999);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new Error("Invalid date format.");
  }
  return { from, to };
};

const buildSearchQuery = (input) => {
  const query = {};
  if (input.status && input.status !== "all") query.status = input.status;
  if (input.date) {
    const date = new Date(input.date);
    if (!isNaN(date.getTime())) {
      const next = new Date(date);
      next.setDate(next.getDate() + 1);
      query.tripDate = { $gte: date, $lt: next };
    }
  }
  if (input.from || input.to) {
    query.tripDate = {};
    const from = new Date(input.from);
    const to = new Date(input.to);
    if (input.from && !isNaN(from.getTime())) {
      from.setUTCHours(0, 0, 0, 0);
      query.tripDate.$gte = from;
    }
    if (input.to && !isNaN(to.getTime())) {
      to.setUTCHours(23, 59, 59, 999);
      query.tripDate.$lte = to;
    }
  }
  Object.assign(query, buildBrandFilter(input.brandId));
  const search = input.search?.trim();
  if (search) {
    query.$or = ["tripId", "directionLabel", "fromStopName", "toStopName"].map(
      (field) => ({ [field]: { $regex: search, $options: "i" } })
    );
  }
  return query;
};

module.exports = {
  dayBounds,
  buildBrandFilter,
  pagination,
  overviewWindow,
  buildSearchQuery,
};
