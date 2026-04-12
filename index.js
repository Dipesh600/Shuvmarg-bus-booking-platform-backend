// Suppress punycode deprecation warning
process.removeAllListeners("warning");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const indexRoute = require("./routes/indexRoute.js");
const startServer = require("./utils/server.js");

const app = express();
const PORT = process.env.PORT || 7012;

// CORS configuration
// const corsOptions = {
//   origin: process.env.FRONTEND_URL || [
//     "http://localhost:3000",
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

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

app.get("/testing", (req, res) => {
  res.send("Welcome to the Sumarg Bus API – Your request was successful!");
});

// Routes
app.use(indexRoute);

app.use((err, req, res, next) => {
  console.error("Global error:", err);
  res.status(500).json({
    status: false,
    message: "Something went wrong",
    error: err.message,
  });
});

startServer(app, PORT);

