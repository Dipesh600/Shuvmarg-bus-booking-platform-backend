'use strict';

const errors = require('./agent-assignment-options.errors');
const mapper = require('./agent-assignment-options.mapper');
const parse = require('./agent-assignment-options.parse');
const repository = require('./agent-assignment-options.repository');

const listOptions = async (ownerId, query) => {
  const input = parse.parseQuery(query);
  if (input.errors.length) throw errors.invalidInput(input.errors);
  const brand = await repository.findOwnedBrand(ownerId, input.brandId);
  if (!brand) throw errors.brandNotFound();
  const schedules = await repository.findActiveSchedules(ownerId, input.brandId);
  return { statusCode: 200, responseBody: mapper.toResponse({ brand, schedules }) };
};

module.exports = { listOptions };
