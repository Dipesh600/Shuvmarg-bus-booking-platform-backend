'use strict';

/**
 * src/modules/shared/document-proxy/index.js
 *
 * Public surface of the document-proxy module.
 * Route files import this file and consume `documentProxy.viewDocument`.
 */

const controller = require('./document-proxy.controller.js');

module.exports = {
    viewDocument: controller.viewDocument,
};
