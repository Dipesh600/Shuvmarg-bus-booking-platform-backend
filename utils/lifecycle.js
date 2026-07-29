/**
 * utils/lifecycle.js
 *
 * Graceful shutdown lifecycle management.
 *
 * Design:
 *   - registerShutdown(server, deps) installs SIGTERM and SIGINT handlers.
 *   - A closing flag prevents duplicate shutdown execution.
 *   - All external dependencies (mongoose, process.exit, logger) are
 *     injected so tests can stub them without polluting global state.
 *   - The returned deregister() function removes all installed listeners,
 *     enabling clean teardown in tests.
 *
 * Shutdown sequence:
 *   1. Stop accepting new HTTP connections (server.close)
 *   2. Close the Mongoose connection
 *   3. Exit 0
 *   Force-exit with code 1 if the sequence exceeds SHUTDOWN_TIMEOUT_MS.
 */

const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * @param {import("http").Server} server
 * @param {object} [deps]
 * @param {object} [deps.mongoose]      - Mongoose instance (injectable for tests)
 * @param {Function} [deps.exit]        - process.exit replacement (injectable for tests)
 * @param {object} [deps.logger]        - Logger with .info/.error methods
 * @returns {{ deregister: Function }}
 */
function registerShutdown(server, deps = {}) {
  const mongoose = deps.mongoose || require("mongoose");
  const exit     = deps.exit     || process.exit.bind(process);
  const logger   = deps.logger   || require("./logger.js");

  let closing = false;

  const shutdown = (signal) => {
    if (closing) return;
    closing = true;

    logger.info(`${signal} received — starting graceful shutdown`);

    const forceTimer = setTimeout(() => {
      logger.error("Graceful shutdown timed out — forcing exit");
      exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    server.close(async (serverErr) => {
      if (serverErr) logger.error("Error closing HTTP server", { error: serverErr.message });

      try {
        await mongoose.connection.close(false);
      } catch (mongoErr) {
        if (mongoErr) logger.error("Error closing Mongoose connection", { error: mongoErr.message });
      }

      clearTimeout(forceTimer);
      logger.info("Shutdown complete");
      exit(0);
    });
  };

  const onSigterm = () => shutdown("SIGTERM");
  const onSigint  = () => shutdown("SIGINT");

  process.on("SIGTERM", onSigterm);
  process.on("SIGINT",  onSigint);

  const deregister = () => {
    process.off("SIGTERM", onSigterm);
    process.off("SIGINT",  onSigint);
  };

  return { deregister };
}

module.exports = { registerShutdown };
