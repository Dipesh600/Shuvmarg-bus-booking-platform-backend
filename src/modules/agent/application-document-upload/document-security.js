'use strict';
const { createKycMalwareScanner } = require('../../bus-owner/kyc-submission/kyc-malware-scanner.service');
const scanner = createKycMalwareScanner();
const canRead = (document, env = process.env.NODE_ENV) => document?.malwareScanStatus === 'clean'
  || (env !== 'production' && !['infected', 'failed'].includes(document?.malwareScanStatus));
const scan = (file, documentType) => scanner.scanValidatedFiles({ [documentType]: [{ file }] });
module.exports = { scan, canRead };
