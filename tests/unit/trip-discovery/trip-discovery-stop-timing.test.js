const { test } = require("node:test");
const assert = require("node:assert");
const { resolveStopTiming } = require("../../../src/modules/trip-discovery/trip-discovery-stop-timing");

test("Trip Discovery Stop Timing", async (t) => {
  const dummyTimeToMins = (time) => {
    if (time === "10:00 AM") return 600;
    if (time === "11:00 AM") return 660;
    return 0;
  };

  await t.test("returns original timings if no operator timing config is present", () => {
    const trip = { departureTime: "08:00 AM", arrivalTime: "04:00 PM" };
    const res = resolveStopTiming({
      trip,
      originStopIds: new Set(["stopA"]),
      destStopIds: new Set(["stopB"]),
      timeToMins: dummyTimeToMins
    });
    assert.strictEqual(res.resolvedDepartureTime, "08:00 AM");
    assert.strictEqual(res.resolvedArrivalTime, "04:00 PM");
    assert.strictEqual(res.failsStopBehaviorGate, false);
  });

  await t.test("uses estimatedDeparture from fromEntry and estimatedArrival from toEntry", () => {
    const trip = {
      departureTime: "08:00 AM",
      arrivalTime: "04:00 PM",
      scheduleId: {
        operatorRouteConfigId: {
          timingConfig: [
            { stopId: "stopA", estimatedDeparture: "10:00 AM", stopBehavior: "BOTH" },
            { stopId: "stopB", estimatedArrival: "11:00 AM", stopBehavior: "BOTH" }
          ]
        }
      }
    };
    const res = resolveStopTiming({
      trip,
      originStopIds: new Set(["stopA"]),
      destStopIds: new Set(["stopB"]),
      timeToMins: dummyTimeToMins
    });
    assert.strictEqual(res.resolvedDepartureTime, "10:00 AM");
    assert.strictEqual(res.resolvedArrivalTime, "11:00 AM");
    assert.strictEqual(res.resolvedOriginStopId, "stopA");
    assert.strictEqual(res.resolvedDestinationStopId, "stopB");
    assert.strictEqual(res.failsStopBehaviorGate, false);
  });

  await t.test("fails stop behavior gate if origin stop is dropping only", () => {
    const trip = {
      scheduleId: {
        operatorRouteConfigId: {
          timingConfig: [
            { stopId: "stopA", estimatedDeparture: "10:00 AM", stopBehavior: "DROPPING_ONLY" }
          ]
        }
      }
    };
    const res = resolveStopTiming({
      trip,
      originStopIds: new Set(["stopA"]),
      destStopIds: new Set(["stopB"]),
      timeToMins: dummyTimeToMins
    });
    assert.strictEqual(res.failsStopBehaviorGate, true);
  });

  await t.test("fails stop behavior gate if actual minutes < operator minimum journey minutes", () => {
    const trip = {
      scheduleId: {
        operatorRouteConfigId: {
          minimumJourneyMinutes: 120, // 2 hours
          timingConfig: [
            { stopId: "stopA", estimatedDeparture: "10:00 AM", stopBehavior: "BOTH" },
            { stopId: "stopB", estimatedArrival: "11:00 AM", stopBehavior: "BOTH" }
          ] // Actual difference is 1 hour
        }
      }
    };
    const res = resolveStopTiming({
      trip,
      originStopIds: new Set(["stopA"]),
      destStopIds: new Set(["stopB"]),
      timeToMins: dummyTimeToMins
    });
    assert.strictEqual(res.failsStopBehaviorGate, true);
  });
});
