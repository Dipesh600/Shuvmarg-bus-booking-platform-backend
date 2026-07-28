const dbConnection = require("../db/db.js");
const logger       = require("./logger.js");

/**
 * utils/server.js
 *
 * Awaits the database connection, then starts the HTTP listener.
 * Returns the http.Server instance so the caller can register
 * lifecycle hooks (e.g. graceful shutdown).
 *
 * Does not install signal handlers itself — that responsibility
 * belongs to the require.main === module entry point (index.js).
 */
const startServer = async (app, PORT) => {
  try {
    await dbConnection();
    logger.info("MongoDB connected", { readyState: "connected" });

    return new Promise((resolve, reject) => {
      const server = app.listen(PORT, () => {
        logger.info(`Server listening on port ${PORT}`);
        resolve(server);
      });
      server.on("error", reject);
    });
  } catch (error) {
    logger.error("Failed to start server", { error: error.message });
    process.exit(1);
  }
};

module.exports = startServer;
