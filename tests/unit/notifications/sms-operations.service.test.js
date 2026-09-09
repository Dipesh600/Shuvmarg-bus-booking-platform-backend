"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { replaySmsNotification } = require("../../../src/modules/admin/sms-operations/sms-operations.service");

test("admin replay requires an audit reason and records the administrator", async () => {
  const calls = [];
  const notificationOutbox = {
    replayFailedSms: async (id, actor) => { calls.push({ id, actor }); return { _id: "new-job", status: "PENDING" }; },
    deliverSmsNotification: async id => ({ jobId: id, status: "PROVIDER_ACCEPTED" }),
  };
  await assert.rejects(() => replaySmsNotification({ messageId: "old", adminId: "admin", reason: "bad" },
    { notificationOutbox }), /between 5 and 300/);
  const result = await replaySmsNotification({ messageId: "old", adminId: "admin", reason: "Provider restored" },
    { notificationOutbox });
  assert.equal(result.status, "PROVIDER_ACCEPTED");
  assert.deepEqual(calls[0], { id: "old", actor: { actorType: "ADMIN", actorId: "admin", reason: "Provider restored" } });
});
