/**
 * utils/logger.js
 * 
 * Structured logging with Winston.
 * - JSON format in production (for log aggregators: CloudWatch, Datadog, etc.)
 * - Pretty colorized format in development
 * - Request ID injection for distributed tracing
 * - Automatic log rotation (prevents disk exhaustion)
 */

const { createLogger, format, transports } = require("winston");
const path = require("path");

const { combine, timestamp, printf, colorize, json, errors } = format;

const isProduction = process.env.NODE_ENV === "production";

// Human-readable format for development
const devFormat = combine(
    colorize({ all: true }),
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }),
    printf(({ level, message, timestamp, stack, requestId, ...meta }) => {
        const reqStr = requestId ? `[${requestId}] ` : "";
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
        return `${timestamp} ${level}: ${reqStr}${message}${stack ? `\n${stack}` : ""}${metaStr}`;
    })
);

// Structured JSON format for production (log aggregators love this)
const prodFormat = combine(
    timestamp(),
    errors({ stack: true }),
    json()
);

const logger = createLogger({
    level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
    format: isProduction ? prodFormat : devFormat,
    defaultMeta: {
        service: "shuvmarg-api",
        env: process.env.NODE_ENV || "development",
    },
    transports: [
        new transports.Console(),
        // File transport for persistent logs (review in production or use CloudWatch)
        new transports.File({
            filename: path.join(__dirname, "../logs/error.log"),
            level: "error",
            maxsize: 5 * 1024 * 1024,   // 5MB max per file
            maxFiles: 5,                  // Keep 5 rotated files
            tailable: true,
        }),
        new transports.File({
            filename: path.join(__dirname, "../logs/combined.log"),
            maxsize: 10 * 1024 * 1024,
            maxFiles: 10,
            tailable: true,
        }),
    ],
});

module.exports = logger;
