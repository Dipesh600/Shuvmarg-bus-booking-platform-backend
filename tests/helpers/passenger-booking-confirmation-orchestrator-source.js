'use strict';

const fs = require('node:fs');
const path = require('node:path');

const orchestratorDir = path.resolve(
  __dirname,
  '../../src/modules/booking/passenger-booking-confirmation-orchestrator'
);

function readPassengerBookingConfirmationOrchestratorSource() {
  return fs.readdirSync(orchestratorDir)
    .filter((file) => file.endsWith('.js'))
    .sort()
    .map((file) => fs.readFileSync(path.join(orchestratorDir, file), 'utf8'))
    .join('\n');
}

module.exports = {
  orchestratorDir,
  readPassengerBookingConfirmationOrchestratorSource,
};
