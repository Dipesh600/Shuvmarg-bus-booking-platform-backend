"use strict";

const dayBounds = (date, now = new Date()) => {
  const value = date ? new Date(date) : now;
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth();
  const day = value.getUTCDate();
  return {
    start: new Date(Date.UTC(year, month, day, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, day, 23, 59, 59, 999)),
  };
};

const monthStart = (monthsAgo = 0, now = new Date()) =>
  new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1)
  );

const shiftUtcDays = (now, days) => {
  const value = new Date(now);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
};

module.exports = { dayBounds, monthStart, shiftUtcDays };
