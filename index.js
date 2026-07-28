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
const cookieParser = require("cookie-parser");
const fs           = require("fs");
const path         = require("path");

const logger        = require("./utils/logger.js");
const errorHandler  = require("./src/shared/http/error-handler.js");
const requestLogger = require("./middleware/requestLogger.js");
const indexRoute    = require("./routes/indexRoute.js");
const startServer       = require("./utils/server.js");
const { registerShutdown } = require("./utils/lifecycle.js");
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
// Support comma-separated FRONTEND_URL for multiple deployed frontends
// e.g. FRONTEND_URL="https://shuvmarg.vercel.app,https://shuvmarg-admin.vercel.app"
const allowedOrigins = [
  "http://localhost:5173",   // Vite super admin dev
  "http://localhost:5174",   // Vite super admin dev (alt port)
  "http://localhost:5175",   // Vite super admin dev (alt port)
  "http://localhost:5176",   // Vite super admin dev (alt port)
  "http://localhost:5177",   // Vite super admin dev (alt port)
  "http://localhost:3000",   // CRA fallback
  "http://localhost:4173",   // Vite preview
  ...(process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(",").map((u) => u.trim()).filter(Boolean)
    : []),
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
  allowedHeaders: ["Content-Type", "Authorization", "X-App-Source"],
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
app.use(cookieParser());
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

// ── Root Status Page (open in browser to confirm backend is live) ─────────────
app.get("/", async (req, res) => {
  const mongoose = require("mongoose");
  const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  const uptime   = Math.floor(process.uptime());
  const mins     = Math.floor(uptime / 60);
  const secs     = uptime % 60;
  const dbColor  = dbStatus === "connected" ? "#D3D925" : "#ff4d4d";
  const dbIcon   = dbStatus === "connected" ? "✓" : "✗";

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Shuvmarg API — Status</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#011a18;color:#F5F7F6;font-family:'Plus Jakarta Sans',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:rgba(0,86,78,0.35);border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(14px);border-radius:24px;padding:48px;max-width:540px;width:100%;box-shadow:0 20px 60px rgba(0,86,78,0.4)}
    .badge{display:inline-flex;align-items:center;gap:8px;background:rgba(211,217,37,0.15);border:1px solid rgba(211,217,37,0.3);border-radius:999px;padding:6px 16px;font-size:13px;font-weight:600;color:#D3D925;margin-bottom:32px}
    .dot{width:8px;height:8px;background:#D3D925;border-radius:50%;animation:pulse 1.5s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
    h1{font-size:28px;font-weight:700;margin-bottom:8px}
    .sub{color:#B7C7C3;font-size:15px;margin-bottom:36px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:32px}
    .stat{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:20px}
    .stat-label{font-size:12px;color:#B7C7C3;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px}
    .stat-value{font-size:22px;font-weight:700}
    .endpoints{background:rgba(0,0,0,0.2);border-radius:16px;padding:20px}
    .endpoints h3{font-size:13px;color:#B7C7C3;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:16px}
    .ep{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05)}
    .ep:last-child{border-bottom:none}
    .method{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;background:rgba(211,217,37,0.15);color:#D3D925}
    .path{font-family:'JetBrains Mono',monospace;font-size:13px;color:#F5F7F6}
    .ep-desc{font-size:12px;color:#B7C7C3;margin-left:auto}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span> Live & Running</div>
    <h1>🚌 Shuvmarg API</h1>
    <p class="sub">Bus booking backend — all systems operational</p>

    <div class="grid">
      <div class="stat">
        <div class="stat-label">Database</div>
        <div class="stat-value" style="color:${dbColor}">${dbIcon} ${dbStatus}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Uptime</div>
        <div class="stat-value">${mins}m ${secs}s</div>
      </div>
      <div class="stat">
        <div class="stat-label">Environment</div>
        <div class="stat-value" style="font-size:16px">${process.env.NODE_ENV || "development"}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Version</div>
        <div class="stat-value" style="font-size:16px">v${process.env.npm_package_version || "1.0.0"}</div>
      </div>
    </div>

    <div class="endpoints">
      <h3>Key Endpoints</h3>
      <div class="ep"><span class="method">GET</span><span class="path">/health</span><span class="ep-desc">JSON status</span></div>
      <div class="ep"><span class="method">POST</span><span class="path">/api/auth/login</span><span class="ep-desc">Auth</span></div>
      <div class="ep"><span class="method">GET</span><span class="path">/api/public/searchTrips</span><span class="ep-desc">Search</span></div>
      <div class="ep"><span class="method">GET</span><span class="path">/api/public/routes</span><span class="ep-desc">Routes</span></div>
    </div>
  </div>
</body>
</html>`);
});

// Legacy test endpoint (keep for backward compat)
app.get("/testing", (req, res) => {
  res.send("Welcome to the Sumarg Bus API – Your request was successful!");
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use(indexRoute);
// ── Global Error Handler ──────────────────────────────────────────────────────
app.use(errorHandler);

if (require.main === module) {
  setupTripGeneratorCron();
  setupFleetDocumentExpiryCron();
  setupReconciliationCron();
  // Note: orphan coupon image cleanup is handled client-side via localStorage
  // tombstoning in the admin Create Offer page — no server-side cron needed.
  startServer(app, PORT).then(registerShutdown);
}

module.exports = app;
