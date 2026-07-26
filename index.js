'use strict';

// Suppress punycode deprecation warning
process.removeAllListeners('warning');
// Polyfill for Node v25 deprecated SlowBuffer (fixes jsonwebtoken/jwa crash)
const _builtinBuffer = require('buffer');
if (!_builtinBuffer.SlowBuffer) {
  _builtinBuffer.SlowBuffer = _builtinBuffer.Buffer;
}
require('dotenv').config();

// Pre-register Admin and SuperAdmin schemas to avoid race conditions/MissingSchemaError
require('./models/adminModel.js');

const fs = require('fs');
const path = require('path');
const startServer = require('./utils/server.js');
const { setupTripGeneratorCron } = require('./services/tripGeneratorCron.js');
const setupFleetDocumentExpiryCron = require('./services/fleetDocumentExpiryCron.js');
const { setupReconciliationCron } = require('./services/reconcilePayments.js');
const { createApp } = require('./src/app.js');
const { createGlobalRateLimiters } = require('./middleware/globalRateLimiters.js');

// Ensure logs directory exists (Winston needs it)
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const PORT = process.env.PORT || 7012;
const productionGlobalRateLimiters = createGlobalRateLimiters();
const app = createApp(productionGlobalRateLimiters);

if (require.main === module) {
  setupTripGeneratorCron();
  setupFleetDocumentExpiryCron();
  setupReconciliationCron();
  startServer(app, PORT);
}

module.exports = app;
module.exports.createApp = createApp;
module.exports.createGlobalRateLimiters = createGlobalRateLimiters;
