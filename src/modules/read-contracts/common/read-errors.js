"use strict";

class ReadContractError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
  }
}

class ReadContractValidationError extends ReadContractError {
  constructor(code, message) {
    super(code, message, 400);
  }
}

class ReadContractNotFoundError extends ReadContractError {
  constructor(code, message) {
    super(code, message, 404);
  }
}

class ReadContractForbiddenError extends ReadContractError {
  constructor(code, message) {
    super(code, message, 403);
  }
}

class ReadContractUnauthorizedError extends ReadContractError {
  constructor(code, message) {
    super(code, message, 401);
  }
}

module.exports = {
  ReadContractError,
  ReadContractValidationError,
  ReadContractNotFoundError,
  ReadContractForbiddenError,
  ReadContractUnauthorizedError,
};
