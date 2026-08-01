"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const policy = require(
  "../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.policy"
);
const tripPolicy = require(
  "../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout-trip.policy"
);
const signature = require(
  "../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.signature"
);
const {
  createPassengerEsewaCheckoutInitiationService,
} = require(
  "../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout-initiation.service"
);

test("canonical selection uses server-owned identity and values", () => {
  const option = {
    sourceType: "BOARDING_LOCATION", stopId: "stop-1",
    boardingLocationId: "location-1", assignmentId: "assignment-1",
    name: "Server-owned name", coordinates: { lat: 27.69, lng: 85.28 },
    time: "08:00",
  };
  const result = tripPolicy.resolveCanonicalBoardingSelection({
    ...option, name: "Tampered name", time: "00:00",
  }, [option], "Boarding point");
  assert.equal(result.name, "Server-owned name");
  assert.equal(result.time, "08:00");
  assert.equal(result.lat, 27.69);
  assert.throws(
    () => tripPolicy.resolveCanonicalBoardingSelection(
      { ...option, assignmentId: "another-assignment" }, [option], "Boarding point"
    ),
    { code: "ESEWA_CHECKOUT_INVALID" }
  );
});

test("checkout revalidates and persists canonical boarding identity", async () => {
  let saved;
  const pickup = {
    sourceType: "BOARDING_LOCATION", stopId: "stop-1",
    boardingLocationId: "location-1", assignmentId: "assignment-1",
    name: "Kalanki Gate", canonicalName: "Kalanki Chowk", stopName: "Kalanki",
    coordinates: { lat: 27.69, lng: 85.28 }, time: "08:00",
  };
  const drop = {
    sourceType: "STOP_FALLBACK", stopId: "stop-2",
    boardingLocationId: null, assignmentId: null,
    name: "Pokhara", canonicalName: "Pokhara", stopName: "Pokhara",
    coordinates: { lat: 28.21, lng: 83.98 }, time: "14:00",
  };
  const service = createPassengerEsewaCheckoutInitiationService({
    readConfig: () => ({
      productCode: "EPAYTEST", secretKey: "secret",
      passengerUrl: "https://passenger.example", paymentUrl: "https://esewa.example",
    }),
    buildQuote: async () => ({
      ok: true,
      quote: {
        requestedSmMoney: 0, gatewayAmount: 1000, finalAmount: 1000,
        discountAmount: 0, smMoneyApplied: 0,
      },
    }),
    repository: {
      findCheckoutTrip: async () => ({
        routeId: { from: "Kathmandu", to: "Pokhara" },
        departureTime: "07:00", arrivalTime: "14:00",
      }),
      createAttempt: async (payload) => {
        saved = payload;
        return payload;
      },
    },
    boardingOptions: async (selection) => {
      assert.deepEqual(selection, {
        tripId: "trip-1", originStopId: "stop-1", destinationStopId: "stop-2",
      });
      return { pickupOptions: [pickup], dropOptions: [drop] };
    },
    signature,
    tripPolicy,
    policy: { ...policy, createTransactionUuid: () => "SM-CANONICAL-1" },
  });

  await service({
    userId: "user-1", activeRole: "passenger",
    hold: {
      _id: "hold-1", tempBookingId: "TEMP-1", tripId: "trip-1",
      seatNumbers: ["a1"], originalAmount: 1000, expiresAt: new Date(),
    },
    body: {
      passengerDetails: [{ name: "Ram Shah", gender: "M", seatNo: "a1" }],
      boardingPoint: { ...pickup, name: "Tampered pickup", time: "00:00" },
      droppingPoint: { ...drop, name: "Tampered drop", time: "00:01" },
    },
  });

  assert.equal(saved.checkoutPayload.boardingPoint.name, "Kalanki Gate");
  assert.equal(saved.checkoutPayload.boardingPoint.boardingLocationId, "location-1");
  assert.equal(saved.checkoutPayload.boardingPoint.lat, 27.69);
  assert.equal(saved.checkoutPayload.droppingPoint.sourceType, "STOP_FALLBACK");
  assert.equal(saved.checkoutPayload.bookedFrom, "Kalanki");
  assert.equal(saved.checkoutPayload.bookedTo, "Pokhara");
});
