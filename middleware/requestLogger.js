/**
 * middleware/requestLogger.js
 * 
 * HTTP request/response logger middleware.
 * Injects requestId for tracing and logs:
 * - METHOD, path, status, duration, IP
 * - Skips logging for /health endpoint (noisy in load balancers)
 */

const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger.js");

const requestLogger = (req, res, next) => {
    // Skip health check logging (load balancer noise)
    if (req.path === "/health") return next();

    const requestId = uuidv4();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    const start = Date.now();

    res.on("finish", () => {
        const duration = Date.now() - start;
        const logData = {
            requestId,
            method:   req.method,
            path:     req.originalUrl,
            status:   res.statusCode,
            duration: `${duration}ms`,
            ip:       req.ip || req.connection?.remoteAddress,
            ua:       req.get("User-Agent"),
        };

        if (res.statusCode >= 500) {
            logger.error("HTTP 5xx", logData);
        } else if (res.statusCode >= 400) {
            logger.warn("HTTP 4xx", logData);
        } else {
            logger.info("HTTP", logData);
        }
    });

    next();
};

module.exports = requestLogger;
