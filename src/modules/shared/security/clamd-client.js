"use strict";
const net = require("node:net");
const DEFAULT_PORT = 3310;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 4_096;
const STREAM_CHUNK_BYTES = 64 * 1024;

class ClamdClientError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ClamdClientError";
    this.code = code;
  }
}

function writeSocket(socket, payload) {
  return new Promise((resolve, reject) => {
    if (socket.destroyed) {
      reject(new ClamdClientError("CLAMD_CONNECTION_CLOSED", "Malware scanner connection closed unexpectedly."));
      return;
    }

    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      socket.off("error", onError);
      socket.off("drain", onDrain);
    };

    socket.once("error", onError);
    if (socket.write(payload)) {
      cleanup();
      resolve();
      return;
    }
    socket.once("drain", onDrain);
  });
}

function parseClamdResponse(rawResponse) {
  const response = String(rawResponse || "").replace(/\0+$/g, "").trim();
  if (/:\s+OK$/i.test(response)) {
    return { status: "clean" };
  }
  const infected = response.match(/:\s+(.+?)\s+FOUND$/i);
  if (infected) {
    return { status: "infected", signature: infected[1] };
  }
  throw new ClamdClientError("CLAMD_INVALID_RESPONSE", "Malware scanner returned an invalid or unsuccessful response.");
}

function createClamdClient({
  host,
  port = DEFAULT_PORT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  createConnection = net.createConnection,
} = {}) {
  if (!host || typeof host !== "string") {
    throw new ClamdClientError("CLAMD_CONFIG_INVALID", "CLAMD_HOST must be configured.");
  }
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new ClamdClientError("CLAMD_CONFIG_INVALID", "CLAMD_PORT must be a valid TCP port.");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new ClamdClientError("CLAMD_CONFIG_INVALID", "CLAMD_TIMEOUT_MS must be between 1 and 120000.");
  }
  async function scanBuffer(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new ClamdClientError("CLAMD_INVALID_PAYLOAD", "A non-empty file buffer is required for malware scanning.");
    }

    return new Promise((resolve, reject) => {
      const socket = createConnection({ host, port });
      let response = Buffer.alloc(0);
      let settled = false;

      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error);
        else resolve(result);
      };

      socket.setTimeout(timeoutMs, () => {
        finish(new ClamdClientError("CLAMD_TIMEOUT", "Malware scanner timed out."));
      });
      socket.on("error", (error) => {
        finish(new ClamdClientError("CLAMD_UNAVAILABLE", `Malware scanner connection failed: ${error.message}`));
      });
      socket.on("data", (chunk) => {
        response = Buffer.concat([response, chunk]);
        if (response.length > MAX_RESPONSE_BYTES) {
          finish(new ClamdClientError("CLAMD_INVALID_RESPONSE", "Malware scanner response exceeded the allowed size."));
          return;
        }
        const terminator = response.indexOf(0);
        if (terminator !== -1) {
          try {
            finish(null, parseClamdResponse(response.subarray(0, terminator).toString("utf8")));
          } catch (error) {
            finish(error);
          }
        }
      });
      socket.on("end", () => {
        if (settled) return;
        try {
          finish(null, parseClamdResponse(response.toString("utf8")));
        } catch (error) {
          finish(error);
        }
      });
      socket.on("connect", async () => {
        try {
          await writeSocket(socket, Buffer.from("zINSTREAM\0", "utf8"));
          for (let offset = 0; offset < buffer.length; offset += STREAM_CHUNK_BYTES) {
            const chunk = buffer.subarray(offset, Math.min(offset + STREAM_CHUNK_BYTES, buffer.length));
            const length = Buffer.allocUnsafe(4);
            length.writeUInt32BE(chunk.length, 0);
            await writeSocket(socket, length);
            await writeSocket(socket, chunk);
          }
          await writeSocket(socket, Buffer.alloc(4));
        } catch (error) {
          finish(error instanceof ClamdClientError
            ? error
            : new ClamdClientError("CLAMD_UNAVAILABLE", `Malware scanner write failed: ${error.message}`));
        }
      });
    });
  }

  return { scanBuffer };
}

module.exports = {
  ClamdClientError,
  createClamdClient,
  parseClamdResponse,
  DEFAULT_PORT,
  DEFAULT_TIMEOUT_MS,
};
