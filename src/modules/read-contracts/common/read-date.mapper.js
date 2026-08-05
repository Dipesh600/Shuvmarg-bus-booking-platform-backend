"use strict";

function toIsoDate(value) {
  if (!value) return null;
  const dateObj = value instanceof Date ? value : new Date(value);
  if (isNaN(dateObj.getTime())) return null;
  return dateObj.toISOString();
}

module.exports = {
  toIsoDate,
};
