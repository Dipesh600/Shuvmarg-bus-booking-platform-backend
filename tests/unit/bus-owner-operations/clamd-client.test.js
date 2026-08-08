"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  createClamdClient,
  parseClamdResponse,
} = require("../../../src/modules/shared/security/clamd-client");

class FakeSocket extends EventEmitter {
  constructor(reply) {
    super();
    this.reply = reply;
    this.writes = [];
    this.destroyed = false;
    queueMicrotask(() => this.emit("connect"));
  }

  setTimeout() {}

  write(payload) {
    const chunk = Buffer.from(payload);
    this.writes.push(chunk);
    if (chunk.length === 4 && chunk.readUInt32BE(0) === 0) {
      queueMicrotask(() => this.emit("data", Buffer.from(`${this.reply}\0`)));
    }
    return true;
  }

  destroy() {
    this.destroyed = true;
  }
}

test("clamd INSTREAM client", async (t) => {
  await t.test("parses clean and infected replies", () => {
    assert.deepEqual(parseClamdResponse("stream: OK"), { status: "clean" });
    assert.deepEqual(parseClamdResponse("stream: Eicar-Signature FOUND"), {
      status: "infected",
      signature: "Eicar-Signature",
    });
    assert.throws(() => parseClamdResponse("stream: ERROR"), /invalid or unsuccessful/i);
  });

  await t.test("uses NUL-framed INSTREAM with big-endian chunk lengths", async () => {
    let socket;
    const client = createClamdClient({
      host: "clamav",
      createConnection: () => {
        socket = new FakeSocket("stream: OK");
        return socket;
      },
    });
    const payload = Buffer.from("safe-document");
    const result = await client.scanBuffer(payload);

    assert.deepEqual(result, { status: "clean" });
    assert.equal(socket.writes[0].toString(), "zINSTREAM\0");
    assert.equal(socket.writes[1].readUInt32BE(0), payload.length);
    assert.deepEqual(socket.writes[2], payload);
    assert.equal(socket.writes.at(-1).readUInt32BE(0), 0);
  });
});
