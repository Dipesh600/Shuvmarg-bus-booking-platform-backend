// Suppress punycode deprecation warning
process.removeAllListeners("warning");
// Polyfill for Node v25 deprecated SlowBuffer (fixes jsonwebtoken/jwa crash)
const _builtinBuffer = require("buffer");
if (!_builtinBuffer.SlowBuffer) {
  _builtinBuffer.SlowBuffer = _builtinBuffer.Buffer;
}
require("dotenv").config();

const express      = require("express");
const cors         = require("cors");
const helmet       = require("helmet");
const rateLimit    = require("express-rate-limit");
const fileUpload   = require("express-fileupload");
const mongoSanitize = require("express-mongo-sanitize");
const fs           = require("fs");
const path         = require("path");

const logger        = require("./utils/logger.js");
const requestLogger = require("./middleware/requestLogger.js");
const indexRoute    = require("./routes/indexRoute.js");
const startServer   = require("./utils/server.js");
const setupTripGeneratorCron      = require("./services/tripGeneratorCron.js");
const setupFleetDocumentExpiryCron = require("./services/fleetDocumentExpiryCron.js");

// Ensure logs directory exists (Winston needs it)
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const app  = express();
const PORT = process.env.PORT || 7012;

// ── Security Middlewares ──────────────────────────────────────────────────────
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));

// NoSQL Injection Protection: strips MongoDB operators ($gt, $where, etc.) from req.body/params/query
app.use(mongoSanitize({
  replaceWith: "_",   // Replace $ chars with _ instead of removing (easier to debug)
  onSanitize: ({ req, key }) => {
    logger.warn("NoSQL injection attempt blocked", { ip: req.ip, key, path: req.path });
  },
}));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 200,
  message: { success: false, message: "Too many requests from this IP. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limiter for public search (prevents DB flooding by bots)
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  max: 30,                   // 30 searches/min per IP
  message: { success: false, message: "Search rate limit exceeded. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", apiLimiter);
app.use("/api/public/searchTrips", searchLimiter);

// ── CORS ──────────────────────────────────────────────────────────────────────
const corsOptions = {
  origin: process.env.FRONTEND_URL || "*",
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// ── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(fileUpload({
  limits: { fileSize: 5 * 1024 * 1024 },  // 5 MB max
  abortOnLimit: true,
}));

// ── Structured HTTP Logging ───────────────────────────────────────────────────
app.use(requestLogger);

// ── Health Check (load balancers, Render, Kubernetes) ────────────────────────
app.get("/health", async (req, res) => {
  const mongoose = require("mongoose");
  const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  const uptime   = Math.floor(process.uptime());

  const status = dbStatus === "connected" ? 200 : 503;
  return res.status(status).json({
    status: dbStatus === "connected" ? "ok" : "degraded",
    db: dbStatus,
    uptimeSeconds: uptime,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
  });
});

// Legacy test endpoint (keep for backward compat)
app.get("/testing", (req, res) => {
  res.send("Welcome to the Sumarg Bus API – Your request was successful!");
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use(indexRoute);

// ── Cron Jobs ─────────────────────────────────────────────────────────────────
setupTripGeneratorCron();
setupFleetDocumentExpiryCron();

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  const isDevelopment = process.env.NODE_ENV === "development";

  logger.error("Unhandled server error", {
    requestId: req.requestId,
    error: err.message,
    stack: isDevelopment ? err.stack : undefined,
    path: req.originalUrl,
    method: req.method,
  });

  res.status(500).json({
    status: false,
    message: "An unexpected server error occurred. Please try again later.",
    error: isDevelopment ? err.message : undefined,
  });
});

startServer(app, PORT);
