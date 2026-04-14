// Suppress punycode deprecation warning
process.removeAllListeners("warning");
// Polyfill for Node v25 deprecated SlowBuffer (fixes jsonwebtoken/jwa crash)
const _builtinBuffer = require("buffer");
if (!_builtinBuffer.SlowBuffer) {
  _builtinBuffer.SlowBuffer = _builtinBuffer.Buffer;
}
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fileUpload = require("express-fileupload");
const indexRoute = require("./routes/indexRoute.js");
const startServer = require("./utils/server.js");
const setupTripGeneratorCron = require("./services/tripGeneratorCron.js");

const app = express();
const PORT = process.env.PORT || 7012;

// Security Middlewares
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));

// Rate Limiting - Basic protection against DDoS/Brute Force
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes",
  standardHeaders: true, 
  legacyHeaders: false, 
});
app.use("/api/", apiLimiter);

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || "*", // For production AWS, you will set this env var to your domains
  credentials: true,
  optionsSuccessStatus: 200,
};
//     "http://localhost:3001",
//     "http://localhost:5173",
//     "http://34.229.93.103",
//     "https://34.229.93.103",
//   ],
//   credentials: true,
//   optionsSuccessStatus: 200,
//   methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
// };

app.use(cors(corsOptions));

app.use(express.json({ limit: "10mb" })); // Prevent large payload attacks
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(fileUpload({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max file size
  abortOnLimit: true
}));

app.get("/testing", (req, res) => {
  res.send("Welcome to the Sumarg Bus API – Your request was successful!");
});

// Routes
app.use(indexRoute);

// Initialize Cron Jobs
setupTripGeneratorCron();

app.use((err, req, res, next) => {
  console.error("Global error:", err);
  
  // Production-grade sanitization: Do not leak internal stack traces or gateway errors to public clients.
  const isDevelopment = process.env.NODE_ENV === "development";
  
  res.status(500).json({
    status: false,
    message: "An unexpected server error occurred. Please try again later.",
    error: isDevelopment ? err.message : undefined, // Only expose raw errors internally during active dev
  });
});

startServer(app, PORT);

