'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../../src/modules/auth/login/login.policy');

/**
 * The X-App-Source role gate, tested without a database.
 *
 * The characterization suite covers this at the HTTP boundary but needs Mongo.
 * This file pins the gate itself, so a regression is caught by any runner.
 */

const passengerOnly = { role: 'passenger', roles: ['passenger'] };
const alsoBusOwner = { role: 'passenger', roles: ['passenger', 'busOwner'] };

/** Resolve, returning either the role or a `403 ERRORCODE` marker. */
function resolve(user, appSource) {
  try {
    return policy.resolveActiveRole(user, appSource);
  } catch (error) {
    return `${error.statusCode} ${error.responseBody && error.responseBody.errorCode}`;
  }
}

test('login policy — X-App-Source role gate', async (t) => {
  await t.test('no header falls back to the primary role', () => {
    assert.equal(resolve(passengerOnly, ''), 'passenger');
  });

  await t.test('a held role is selected', () => {
    assert.equal(resolve(alsoBusOwner, 'busowner'), 'busOwner');
    assert.equal(resolve(passengerOnly, 'passenger'), 'passenger');
  });

  await t.test('a role the user does not hold is refused, never downgraded', () => {
    for (const appSource of ['agent', 'conductor', 'driver', 'busowner']) {
      assert.equal(resolve(passengerOnly, appSource), '403 ROLE_NOT_REGISTERED', appSource);
    }
  });

  // The gate used to be a case-sensitive list holding 'busOwner' compared against
  // an already-lowercased header, so 'busowner' never matched and the request was
  // issued a passenger session with 200 instead of being refused.
  await t.test('casing and surrounding space do not change the outcome', () => {
    for (const appSource of ['busOwner', 'BUSOWNER', 'BusOwner', ' busowner ']) {
      assert.equal(resolve(passengerOnly, appSource), '403 ROLE_NOT_REGISTERED', appSource);
      assert.equal(resolve(alsoBusOwner, appSource), 'busOwner', appSource);
    }
  });

  // The lookup key is attacker-controlled, so it must not reach Object.prototype.
  await t.test('inherited property names are unknown sources, not roles', () => {
    for (const appSource of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      assert.equal(resolve(passengerOnly, appSource), 'passenger', appSource);
    }
  });

  await t.test('junk and non-strings fall back rather than throwing', () => {
    for (const appSource of ['nonsense', '', undefined, null, 42, {}, []]) {
      assert.equal(resolve(passengerOnly, appSource), 'passenger', String(appSource));
    }
  });

  await t.test('a user with a missing roles array falls back to role', () => {
    assert.equal(resolve({ role: 'agent' }, ''), 'agent');
    assert.equal(resolve({ role: 'agent' }, 'agent'), 'agent');
    assert.equal(resolve({ role: 'agent' }, 'driver'), '403 ROLE_NOT_REGISTERED');
  });
});
