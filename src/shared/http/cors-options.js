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

const parseConfiguredOrigins = (frontendUrl = "") =>
  frontendUrl.split(",").map((origin) => origin.trim()).filter(Boolean);

const createCorsOptions = ({
  frontendUrl = process.env.FRONTEND_URL || "",
} = {}) => {
  const allowedOrigins = new Set([
    ...LOCAL_ORIGINS,
    ...parseConfiguredOrigins(frontendUrl),
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
