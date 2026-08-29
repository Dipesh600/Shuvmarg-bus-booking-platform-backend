'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const parse = require('../../../src/modules/bus-owner/agent-assign/bus-owner-agent-assign.parse');
const terms = require('../../../src/modules/bus-owner/agent-assign/bus-owner-agent-assign.terms');

const ID_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ID_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

/** Collects the errors a parser pushed, so each case can assert on them. */
const collect = (fn) => {
  const errors = [];
  const value = fn(errors);
  return { errors, value };
};

test('assign terms — id lists', async (t) => {
  await t.test('accepts 24-hex ids and drops duplicates', () => {
    const { errors, value } = collect((e) => parse.parseIdList([ID_A, ID_B, ID_A], 'f', e));
    assert.deepEqual(value, [ID_A, ID_B]);
    assert.deepEqual(errors, []);
  });

  await t.test('an absent list is empty, not an error', () => {
    assert.deepEqual(collect((e) => parse.parseIdList(undefined, 'f', e)), { errors: [], value: [] });
    assert.deepEqual(collect((e) => parse.parseIdList(null, 'f', e)), { errors: [], value: [] });
  });

  await t.test('refuses a non-array, a bad id, and an oversized list', () => {
    for (const input of ['not-an-array', [ID_A, 'nope'], new Array(201).fill(ID_A)]) {
      const { errors, value } = collect((e) => parse.parseIdList(input, 'f', e));
      assert.equal(errors.length, 1);
      // Rejected lists come back empty so a partial list cannot be stored as if
      // the operator had chosen it.
      assert.deepEqual(value, []);
    }
  });
});

test('assign terms — numbers', async (t) => {
  const num = (value, opts) => collect((e) => parse.parseNumber({ f: value }, 'f', e, opts));

  await t.test('an out-of-range value is undefined, never clamped', () => {
    const { errors, value } = num(120, { min: 0, max: 100 });
    assert.equal(value, undefined);
    assert.equal(errors.length, 1);
  });

  await t.test('rejects non-numbers and fractions where a whole number is asked for', () => {
    assert.equal(num('7', { min: 0 }).value, undefined);
    assert.equal(num(Number.NaN, { min: 0 }).value, undefined);
    assert.equal(num(1.5, { min: 0 }).value, undefined);
    assert.equal(num(1.5, { integer: false, min: 0 }).value, 1.5);
  });

  await t.test('null passes only where null is meaningful', () => {
    assert.equal(num(null, { min: 1, nullable: true }).value, null);
    assert.equal(num(null, { min: 1 }).value, undefined);
  });
});

test('assign terms — access scope', async (t) => {
  await t.test('defaults to ALL_BUSES with empty lists', () => {
    const { errors, value } = collect((e) => terms.parseAccess({}, e));
    assert.deepEqual(value, { accessScope: 'ALL_BUSES', allowedRouteIds: [], allowedScheduleIds: [] });
    assert.deepEqual(errors, []);
  });

  await t.test('requires the list the chosen scope narrows by', () => {
    const { errors } = collect((e) => terms.parseAccess({ accessScope: 'ROUTES' }, e));
    assert.match(errors[0], /allowedRouteIds is required/);
  });

  await t.test('refuses a list the scope does not use rather than dropping it', () => {
    const { errors } = collect((e) => terms.parseAccess({ allowedRouteIds: [ID_A] }, e));
    assert.match(errors[0], /allowedRouteIds cannot be set when accessScope is ALL_BUSES/);
  });

  await t.test('refuses an unknown scope', () => {
    const { errors } = collect((e) => terms.parseAccess({ accessScope: 'EVERYTHING' }, e));
    assert.match(errors[0], /not a recognised access scope/);
  });

  await t.test('accepts a scope typed in lower case', () => {
    const { errors, value } = collect((e) => terms.parseAccess({
      accessScope: 'schedules', allowedScheduleIds: [ID_B],
    }, e));
    assert.deepEqual(errors, []);
    assert.equal(value.accessScope, 'SCHEDULES');
  });
});

test('assign terms — permissions', async (t) => {
  await t.test('absent keys stay absent so the schema owns the defaults', () => {
    assert.deepEqual(collect((e) => terms.parsePermissions(undefined, e)).value, {});
  });

  await t.test('an unknown key cannot become a stored permission', () => {
    const { errors, value } = collect((e) => terms.parsePermissions({ isSuperAgent: true }, e));
    assert.deepEqual(value, {});
    assert.deepEqual(errors, []);
  });

  await t.test('booleans must be booleans', () => {
    const { errors, value } = collect((e) => terms.parsePermissions({ canSellCash: 'yes' }, e));
    assert.deepEqual(value, {});
    assert.match(errors[0], /permissions.canSellCash must be true or false/);
  });

  await t.test('a cancel window without the cancel right is refused', () => {
    const { errors } = collect((e) => terms.parsePermissions({ cancelWindowMins: 30 }, e));
    assert.match(errors[0], /requires permissions.canCancel to be true/);
    // Granted together, it is fine.
    const ok = collect((e) => terms.parsePermissions({ canCancel: true, cancelWindowMins: 30 }, e));
    assert.deepEqual(ok.errors, []);
    assert.deepEqual(ok.value, { canCancel: true, cancelWindowMins: 30 });
  });

  await t.test('null maxSeatsPerBooking means uncapped and is allowed', () => {
    const { errors, value } = collect((e) => terms.parsePermissions({ maxSeatsPerBooking: null }, e));
    assert.deepEqual(errors, []);
    assert.deepEqual(value, { maxSeatsPerBooking: null });
  });
});

test('assign terms — commission', async (t) => {
  await t.test('absent commission is left to the schema default', () => {
    assert.equal(collect((e) => terms.parseCommission(undefined, e)).value, undefined);
    assert.equal(collect((e) => terms.parseCommission(null, e)).value, undefined);
  });

  await t.test('accepts a valid pair, upper-casing the mode', () => {
    const { errors, value } = collect((e) => terms.parseCommission({ mode: 'percent', value: 8 }, e));
    assert.deepEqual(errors, []);
    assert.deepEqual(value, { mode: 'PERCENT', value: 8 });
  });

  await t.test('refuses more than 100 percent, and an unknown mode', () => {
    assert.equal(collect((e) => terms.parseCommission({ mode: 'PERCENT', value: 101 }, e)).value, undefined);
    assert.equal(collect((e) => terms.parseCommission({ mode: 'BARTER', value: 1 }, e)).value, undefined);
    // A flat rate has no upper bound to check — the fare is not known yet.
    assert.deepEqual(
      collect((e) => terms.parseCommission({ mode: 'FLAT_PER_SEAT', value: 5000 }, e)).value,
      { mode: 'FLAT_PER_SEAT', value: 5000 },
    );
  });
});
