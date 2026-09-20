const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config({ path: './.env' });

// internal imports
const connectDB = require('./src/utils/databaseUtil');
const userRouter = require('./src/routes/userRouter');
const requestRouter = require('./src/routes/requestRouter');
const donationRouter = require('./src/routes/donationRouter');
const hospitalRouter = require('./src/routes/hospitalRouter');
const notificationRouter = require('./src/routes/notificationRouter');
const statsRouter = require('./src/routes/statsRouter');
const adminRouter = require('./src/routes/adminRouter');
const geocodeRouter = require('./src/routes/geocodeRouter');
const { startTimeoutWorker, stopTimeoutWorker } = require('./src/utils/timeoutEscalationWorker');
const ensureAdminUser = require('./src/utils/ensureAdminUser');

const PORT = process.env.PORT || 5000;

// Gather all allowed origins from environment variables
const rawOrigins = [
  process.env.CLIENT_ORIGIN,
  process.env.CLIENT_URL,
  process.env.CORS_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://localhost:5000',
].filter(Boolean);

const CLIENT_ORIGINS = rawOrigins
  .flatMap((str) => str.split(','))
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const rootDir = path.resolve();
const app = express();
app.set('trust proxy', 1);

// ── Compression Middleware (Mobile payload size optimization) ──
try {
  const compression = require('compression');
  app.use(compression());
} catch {
  // Graceful fallback if compression is not installed locally
}

// ── Security Headers (Helmet with graceful fallback) ──
try {
  const helmet = require('helmet');
  app.use(
    helmet({
      contentSecurityPolicy: false, // Prevents conflicts with Google GIS & Leaflet CARTO tile layers
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
} catch {
  // Built-in basic security headers fallback
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });
}

// ── CORS Configuration ──
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || CLIENT_ORIGINS.includes(origin.replace(/\/$/, ''))) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(rootDir, 'public')));
app.use(cookieParser());

// ── Rate Limiter on Sensitive Auth Routes ──
let authLimiter;
try {
  const rateLimit = require('express-rate-limit');
  authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 requests per window
    message: {
      success: false,
      message: 'Too many authentication attempts from this IP. Please try again in 15 minutes.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
} catch {
  // In-memory lightweight rate limiter fallback
  const attemptMap = new Map();
  authLimiter = (req, res, next) => {
    const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const record = attemptMap.get(clientIp) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count += 1;
    }
    attemptMap.set(clientIp, record);

    if (record.count > 40) {
      return res.status(429).json({
        success: false,
        message: 'Too many authentication attempts. Please try again in 15 minutes.',
      });
    }
    next();
  };
}

// Apply rate limiting to sensitive auth endpoints
app.use('/auth/login', authLimiter);
app.use('/auth/google', authLimiter);
app.use('/auth/forgot-password', authLimiter);
app.use('/auth/reset-password', authLimiter);

// ── Health Check Endpoints (For uptime monitors & cloud health checks) ──
const healthHandler = (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: Math.floor(process.uptime()),
    service: 'blood-bank-api',
    environment: process.env.NODE_ENV || 'development',
  });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// ── Application Routes ──
app.use('/', userRouter);
app.use('/', requestRouter);
app.use('/', donationRouter);
app.use('/', hospitalRouter);
app.use('/', notificationRouter);
app.use('/', statsRouter);
app.use('/', adminRouter);
app.use('/', geocodeRouter);

// ── 404 Handler ──
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ── Global Error Handler ──
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
  });
});

// ── Database Connection and Server Startup ──
let server;
connectDB()
  .then(async () => {
    // Ensure default system administrator exists in database
    await ensureAdminUser();

    // Start background timeout escalation worker
    startTimeoutWorker();

    // Listen on 0.0.0.0 for cloud platform compatibility (Render, Railway, Docker, VPS)
    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server is running on http://0.0.0.0:${PORT}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `❌ Port ${PORT} is already in use. Stop the other process or set PORT in .env.\n` +
            `   Windows: netstat -ano | findstr :${PORT}  then  taskkill /PID <pid> /F`
        );
      } else {
        console.error('❌ Server failed to start:', err);
      }
      stopTimeoutWorker();
      process.exit(1);
    });
  })
  .catch((error) => {
    console.error('Failed to connect to the database. Server not started.', error);
    process.exit(1);
  });

// Graceful shutdown handling
const handleShutdown = () => {
  console.log('🛑 Shutting down server...');
  stopTimeoutWorker();
  server?.close(() => process.exit(0));
};

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
