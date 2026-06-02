// Suppress punycode deprecation warning
process.removeAllListeners("warning");
// Polyfill for Node v25 deprecated SlowBuffer (fixes jsonwebtoken/jwa crash)
const _builtinBuffer = require("buffer");
if (!_builtinBuffer.SlowBuffer) {
  _builtinBuffer.SlowBuffer = _builtinBuffer.Buffer;
}
require("dotenv").config();

// Pre-register Admin and SuperAdmin schemas to avoid race conditions/MissingSchemaError
require("./models/adminModel.js");

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
const { setupTripGeneratorCron } = require("./services/tripGeneratorCron.js");
const setupFleetDocumentExpiryCron = require("./services/fleetDocumentExpiryCron.js");
const { setupReconciliationCron } = require("./services/reconcilePayments.js");

// Ensure logs directory exists (Winston needs it)
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const app  = express();
const PORT = process.env.PORT || 7012;

// ── CORS — MUST be first middleware before helmet / rate limiter ──────────────
// Wildcard '*' conflicts with credentials:true, so we use a function-based origin.
const allowedOrigins = [
  "http://localhost:5173",   // Vite super admin dev
  "http://localhost:5174",   // Vite super admin dev (alt port)
  "http://localhost:5175",   // Vite super admin dev (alt port)
  "http://localhost:5176",   // Vite super admin dev (alt port)
  "http://localhost:5177",   // Vite super admin dev (alt port)
  "http://localhost:3000",   // CRA fallback
  "http://localhost:4173",   // Vite preview
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, mobile apps, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,   // Some browsers (IE11) choke on 204
};

app.use(cors(corsOptions));
// Explicit pre-flight handler for all routes.
// path-to-regexp v8 (Express 5 / standalone router) does NOT accept bare '*'
// as a path — use the named wildcard '/{*splat}' instead.
app.options("/{*splat}", cors(corsOptions));


// ── Security Middlewares ──────────────────────────────────────────────────────
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));


// NoSQL Injection Protection — safe wrapper that avoids the
// "Cannot set property query of #<IncomingMessage> which has only a getter"
// error caused by express-mongo-sanitize trying to reassign req.query on
// OPTIONS (CORS preflight) requests in Express 5 / standalone router.
//
// Strategy:
//   1. Skip OPTIONS & HEAD requests entirely (they carry no body/query payload)
//   2. Use mongoSanitize.sanitize() on body + params (writable)
//   3. For query params: deep-clone, sanitize the clone, re-assign individual keys
//      (avoids re-assigning req.query itself which is read-only)
app.use((req, res, next) => {
  if (req.method === "OPTIONS" || req.method === "HEAD") return next();

  try {
    // Sanitize body and params in-place (both are writable plain objects)
    if (req.body   && typeof req.body   === "object") req.body   = mongoSanitize.sanitize(req.body,   { replaceWith: "_" });
    if (req.params && typeof req.params === "object") req.params = mongoSanitize.sanitize(req.params, { replaceWith: "_" });

    // For query: sanitize a copy then patch individual keys (req.query is a getter)
    if (req.query && typeof req.query === "object") {
      const sanitizedQuery = mongoSanitize.sanitize({ ...req.query }, { replaceWith: "_" });
      Object.keys(sanitizedQuery).forEach((k) => {
        try { req.query[k] = sanitizedQuery[k]; } catch (_) { /* read-only key — skip */ }
      });
    }
  } catch (sanitizeErr) {
    logger.warn("mongoSanitize middleware error (skipped)", { error: sanitizeErr.message, path: req.path });
  }

  next();
});



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



// ── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(fileUpload({
  limits: { fileSize: 20 * 1024 * 1024 },  // 20 MB max per file
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
setupReconciliationCron();

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
