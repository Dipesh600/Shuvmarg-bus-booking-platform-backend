"use strict";

const { ReadContractValidationError } = require("./read-errors");

function parsePagination(query = {}) {
  const rawPage = query.page !== undefined ? query.page : 1;
  const rawLimit = query.limit !== undefined ? query.limit : 20;

  const page = Number(rawPage);
  if (!Number.isInteger(page) || page < 1) {
    throw new ReadContractValidationError(
      "READ_INVALID_PAGE",
      "Page must be a positive integer greater than or equal to 1."
    );
  }

  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ReadContractValidationError(
      "READ_INVALID_LIMIT",
      "Limit must be an integer between 1 and 100."
    );
  }

  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

function formatPagination({ page, limit, totalItems }) {
  const validTotal = Math.max(0, Number(totalItems) || 0);
  const totalPages = validTotal === 0 ? 0 : Math.ceil(validTotal / limit);

  return {
    page,
    limit,
    totalItems: validTotal,
    totalPages,
  };
}

module.exports = {
  parsePagination,
  formatPagination,
};
