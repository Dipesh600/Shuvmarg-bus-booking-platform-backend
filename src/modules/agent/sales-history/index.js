'use strict';

const errors = require('../../../shared/agent-sales/agent-sales.errors');
const mapper = require('../../../shared/agent-sales/agent-sales.mapper');
const parse = require('../../../shared/agent-sales/agent-sales.parse');
const repository = require('../../../shared/agent-sales/agent-sales.repository');
const { createController } = require('./agent-sales-history.controller');
const { createService } = require('./agent-sales-history.service');

const service = createService({ errors, mapper, parse, repository });

module.exports = createController(service);
