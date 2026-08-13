"use strict";

// One source of truth prevents a successful candidate scan from being hidden
// as stale by a mapper running a different engine version.
const ROUTE_DATA_VERSION = 2;
const CANDIDATE_ENGINE_VERSION = 14;

module.exports = { CANDIDATE_ENGINE_VERSION, ROUTE_DATA_VERSION };
