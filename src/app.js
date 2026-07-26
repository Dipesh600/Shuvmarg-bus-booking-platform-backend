'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fileUpload = require('express-fileupload');
const mongoSanitize = require('express-mongo-sanitize');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

const logger = require('../utils/logger.js');
const errorHandler = require('./shared/http/error-handler.js');
const requestLogger = require('../middleware/requestLogger.js');
const indexRoute = require('../routes/indexRoute.js');
const globalLimiters = require('../middleware/globalRateLimiters.js');

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:3000',
  'http://localhost:4173',
  ...(process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((u) => u.trim()).filter(Boolean)
    : []),
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-App-Source'],
  optionsSuccessStatus: 200,
};

const createApp = ({
  apiLimiter = globalLimiters.apiLimiter,
  searchLimiter = globalLimiters.searchLimiter,
} = {}) => {
  const app = express();

  app.use(cors(corsOptions));
  app.options('/{*splat}', cors(corsOptions));

  app.use(helmet());
  app.use(helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }));

  app.use((req, res, next) => {
    if (req.method === 'OPTIONS' || req.method === 'HEAD') return next();
    try {
      if (req.body && typeof req.body === 'object') req.body = mongoSanitize.sanitize(req.body, { replaceWith: '_' });
      if (req.params && typeof req.params === 'object') req.params = mongoSanitize.sanitize(req.params, { replaceWith: '_' });
      if (req.query && typeof req.query === 'object') {
        const sanitizedQuery = mongoSanitize.sanitize({ ...req.query }, { replaceWith: '_' });
        Object.keys(sanitizedQuery).forEach((k) => {
          try { req.query[k] = sanitizedQuery[k]; } catch (_) { /* skip */ }
        });
      }
    } catch (sanitizeErr) {
      logger.warn('mongoSanitize middleware error (skipped)', { error: sanitizeErr.message, path: req.path });
    }
    next();
  });

  app.use('/api/', apiLimiter);
  app.use('/api/public/searchTrips', searchLimiter);

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(cookieParser());
  app.use(fileUpload({
    limits: { fileSize: 20 * 1024 * 1024 },
    abortOnLimit: true,
  }));
  app.use(requestLogger);

  app.get('/health', async (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const uptime = Math.floor(process.uptime());
    const status = dbStatus === 'connected' ? 200 : 503;
    return res.status(status).json({
      status: dbStatus === 'connected' ? 'ok' : 'degraded',
      db: dbStatus,
      uptimeSeconds: uptime,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  app.get('/', async (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const uptime = Math.floor(process.uptime());
    const mins = Math.floor(uptime / 60);
    const secs = uptime % 60;
    const dbColor = dbStatus === 'connected' ? '#D3D925' : '#ff4d4d';
    const dbIcon = dbStatus === 'connected' ? '✓' : '✗';
    res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Shuvmarg API Status</title></head><body><h1>Shuvmarg API</h1><p>Status: ${dbStatus}</p></body></html>`);
  });

  app.get('/testing', (req, res) => {
    res.send('Welcome to the Sumarg Bus API – Your request was successful!');
  });

  app.use(indexRoute);
  app.use(errorHandler);

  return app;
};

module.exports = {
  createApp,
};
