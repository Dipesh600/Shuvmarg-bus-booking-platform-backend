'use strict';

const errors = require('../../../shared/agent-sales/agent-sales.errors');
const mapper = require('../../../shared/agent-sales/agent-sales.mapper');
const parse = require('../../../shared/agent-sales/agent-sales.parse');
const repository = require('../../../shared/agent-sales/agent-sales.repository');
const { createController } = require('./owner-agent-sales.controller');
const { createService } = require('./owner-agent-sales.service');

const service = createService({ errors, mapper, parse, repository });

module.exports = { listSales: createController(service) };
