"use strict";

const AppError = require("../errors/app-error.js");

const LOCAL_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://localhost:5177",
  "http://localhost:3000",
  "http://localhost:4173",
];

/**
 * Split a comma-separated origin string into a trimmed, de-duped array.
 * @param {string} [originString=""]
 * @returns {string[]}
 */
const parseConfiguredOrigins = (originString = "") =>
  Array.from(
    new Set(
      originString
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    )
  );

/**
 * Build the Express cors() options object.
 *
 * Origin resolution order (first non-empty value wins):
 *   1. CORS_ALLOWED_ORIGINS — recommended variable for all new / staging deployments
 *   2. FRONTEND_URL         — legacy variable; retained for backward compatibility with
 *                             existing Oracle staging/production configurations
 *
 * Both accept comma-separated lists of full origin strings, e.g.:
 *   CORS_ALLOWED_ORIGINS="https://staging.shuvmarg.com,https://admin-staging.shuvmarg.com"
 *
 * @param {{ corsAllowedOrigins?: string, frontendUrl?: string }} [overrides]
 */
const createCorsOptions = ({
  corsAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS,
  frontendUrl       = process.env.FRONTEND_URL,
} = {}) => {
  const primary = (corsAllowedOrigins ?? "").trim();
  const fallback = (frontendUrl ?? "").trim();
  const configuredEnv = primary || fallback;

  const allowedOrigins = new Set([
    ...LOCAL_ORIGINS,
    ...parseConfiguredOrigins(configuredEnv),
  ]);

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new AppError(
        "CORS origin denied",
        403,
        {
          success: false,
          message: "This browser origin is not allowed to access the API.",
          errorCode: "CORS_ORIGIN_DENIED",
        },
        "CORS_ORIGIN_DENIED"
      ));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-App-Source"],
    optionsSuccessStatus: 200,
  };
};

module.exports = {
  createCorsOptions,
  parseConfiguredOrigins,
};
