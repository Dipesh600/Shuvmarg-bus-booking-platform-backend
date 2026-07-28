'use strict';

/**
 * src/shared/http/respond.js
 *
 * Minimal response passthrough.  Sets the HTTP status code and serialises
 * `body` as JSON.  Does not inject, rename or normalise any fields.
 *
 * The repository has inconsistent legacy response contracts; this helper must
 * not attempt to unify them.  Callers are responsible for supplying the exact
 * body shape required by their endpoint contract.
 *
 * Usage
 * -----
 *   return respond(res, 200, { success: true, data: result });
 *   return respond(res, 404, { status: false, message: 'Not found' });
 *
 * @param  {import('express').Response} res        Express response object
 * @param  {number}                     statusCode  HTTP status code
 * @param  {*}                          body        Value to serialise as JSON
 * @returns {import('express').Response}
 */
const respond = (res, statusCode, body) => res.status(statusCode).json(body);

module.exports = respond;
