"use strict";
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const fixture = require("../helpers/security-cancellation-fixtures");
const Job = require("../../models/bookingCashbackJobModel");
const Card = require("../../models/scratchCardModel");
const { recoverBookingCashback } = require("../../services/bookingCashbackRecovery");
let data;
before(async () => { await fixture.start(); await Job.init(); });
after(fixture.stop);
beforeEach(async () => {
  data = await fixture.seed(); await fixture.Ledger.deleteMany({}); await Job.deleteMany({});
  await Job.create({ _id: data.booking._id, userId: data.userId, baseTicketPrice: 1000 });
});
const generate = () => fixture.ledgerService.generateCashback({
  userId: data.userId, bookingId: data.booking._id, baseTicketPrice: 1000,
});
test("overlapping workers and request retries award exactly one cashback", async () => {
  await Promise.all([recoverBookingCashback(), recoverBookingCashback(), generate(), generate()]);
  assert.equal(await fixture.Ledger.countDocuments({ type: "CASHBACK" }), 1);
  assert.equal(await Card.countDocuments({}), 1);
  assert.equal((await Job.findById(data.booking._id)).status, "COMPLETED");
  const first = await generate(), second = await generate();
  assert.equal(String(first.scratchCard._id), String(second.scratchCard._id));
});
test("failed scratch-card write rolls back credit and leaves a retryable job", async () => {
  const create = Card.create;
  Card.create = async () => { throw new Error("injected failure"); };
  try { await recoverBookingCashback(); } finally { Card.create = create; }
  assert.equal(await fixture.Ledger.countDocuments({}), 0);
  assert.equal((await Job.findById(data.booking._id)).status, "PENDING");
  await Job.updateOne({ _id: data.booking._id }, { $set: { nextAttemptAt: new Date(0) } });
  await recoverBookingCashback();
  assert.equal(await Card.countDocuments({}), 1);
});
test("reward retry after cancellation cannot restore clawed-back money", async () => {
  await generate();
  await fixture.build().cancelPassengerBooking(data.booking.ticketId, data.userId, "changed plans", {});
  assert.equal(await generate(), null);
  assert.equal(await fixture.Ledger.countDocuments({ type: "CASHBACK", status: "ACTIVE" }), 0);
});
test("concurrent cancellation and reward finish with no spendable cashback", async () => {
  await Promise.all([generate(), fixture.build().cancelPassengerBooking(data.booking.ticketId, data.userId, "changed plans", {})]);
  assert.equal(await fixture.Ledger.countDocuments({ type: "CASHBACK", status: "ACTIVE" }), 0);
  await recoverBookingCashback();
  assert.equal(await fixture.Ledger.countDocuments({ type: "CASHBACK", status: "ACTIVE" }), 0);
});
test("wrong owner and altered amount fail without reward", async () => {
  await assert.rejects(() => fixture.ledgerService.generateCashback({ userId: new mongoose.Types.ObjectId(),
    bookingId: data.booking._id, baseTicketPrice: 1000 }), /belong/);
  await assert.rejects(() => fixture.ledgerService.generateCashback({ userId: data.userId,
    bookingId: data.booking._id, baseTicketPrice: 2000 }), /differs/);
  assert.equal(await Card.countDocuments({}), 0);
});
test("partial historical cashback is held for review without duplicate credit", async () => {
  await fixture.Ledger.create({ userId: data.userId, bookingId: data.booking._id, type: "CASHBACK",
    direction: "CREDIT", status: "ACTIVE", amount: 10, remainingAmount: 10 });
  await assert.rejects(generate, /review/);
  assert.equal(await fixture.Ledger.countDocuments({}), 1);
  assert.equal((await Job.findById(data.booking._id)).status, "PENDING");
});
