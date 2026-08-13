"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { seatLayoutV3Fingerprint } = require("../../src/domain/seat-layout-v3");
const { standard2x2 } = require("../fixtures/seat-layout-v3.fixtures");

test("fingerprint is stable when element array order changes", () => {
  const first = standard2x2();
  const second = structuredClone(first);
  second.sections[0].elements.reverse();
  assert.equal(seatLayoutV3Fingerprint(first), seatLayoutV3Fingerprint(second));
});

test("fingerprint is stable when section array order changes", () => {
  const first = require("../fixtures/seat-layout-v3.fixtures").fullSleeper();
  const second = structuredClone(first);
  second.sections.reverse();
  assert.equal(seatLayoutV3Fingerprint(first), seatLayoutV3Fingerprint(second));
});

test("fingerprint changes when physical geometry changes", () => {
  const first = standard2x2();
  const second = structuredClone(first);
  const left = second.sections[0].elements[0];
  const right = second.sections[0].elements[1];
  [left.position.x, right.position.x] = [right.position.x, left.position.x];
  assert.notEqual(seatLayoutV3Fingerprint(first), seatLayoutV3Fingerprint(second));
});

test("fingerprint changes when passenger classification changes", () => {
  const first = standard2x2();
  const second = structuredClone(first);
  second.sections[0].elements[0].attributes.commercialClass = "PREMIUM";
  assert.notEqual(seatLayoutV3Fingerprint(first), seatLayoutV3Fingerprint(second));
});
