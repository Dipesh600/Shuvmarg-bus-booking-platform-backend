const { test, mock } = require("node:test");
const assert = require("node:assert");
const notificationManagerApi = require("../../../controllers/notificationController/notification_manager");

const { createPassengerBookingCancellationNotificationService } = require("../../../src/modules/booking/passenger-booking-cancellation/passenger-booking-cancellation-notification.service.js");

test("sendCancellationNotifications - sends local and push", async (t) => {
  mock.method(notificationManagerApi, "createLocalNotification", async () => true);
  mock.method(notificationManagerApi, "notificationManager", async () => true);
  
  const repository = {
    findTripByIdWithRoute: async () => ({
      routeId: { from: "A", to: "B" }
    }),
    findUserDevices: async () => [{ token: "token1" }, { token: "token2" }]
  };
  const service = createPassengerBookingCancellationNotificationService(repository);

  const booking = { tripId: "trip1", ticketId: "T1", seats: ["A1"] };
  await service.sendCancellationNotifications("u1", booking, 100);

  assert.strictEqual(notificationManagerApi.createLocalNotification.mock.calls.length, 1);
  assert.strictEqual(notificationManagerApi.notificationManager.mock.calls.length, 1);
});

test("sendCancellationNotifications - no route details", async (t) => {
  mock.method(notificationManagerApi, "createLocalNotification", async () => true);
  
  const repository = {
    findTripByIdWithRoute: async () => null,
    findUserDevices: async () => []
  };
  const service = createPassengerBookingCancellationNotificationService(repository);

  await service.sendCancellationNotifications("u1", { tripId: "trip1", ticketId: "T1" }, 100);
  const args = notificationManagerApi.createLocalNotification.mock.calls[0].arguments;
  assert.ok(args[3].includes("Route information not available"));
});

test("sendCancellationNotifications - swallows errors", async (t) => {
  mock.method(notificationManagerApi, "createLocalNotification", async () => { throw new Error("local notify fail"); });
  const repository = {
    findTripByIdWithRoute: async () => null,
    findUserDevices: async () => []
  };
  const service = createPassengerBookingCancellationNotificationService(repository);

  const origErr = console.error;
  let logged = false;
  console.error = () => { logged = true; };

  await service.sendCancellationNotifications("u1", {}, 100);
  assert.strictEqual(logged, true);
  
  console.error = origErr;
});
