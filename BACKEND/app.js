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
const { startTimeoutWorker, stopTimeoutWorker } = require('./src/utils/timeoutEscalationWorker');
const ensureAdminUser = require('./src/utils/ensureAdminUser');

const PORT = process.env.PORT || 3000;
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const rootDir = path.resolve();
const app = express();

// middlewares
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || CLIENT_ORIGINS.includes(origin)) {
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

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, service: 'blood-bank-api' });
});

const adminRouter = require('./src/routes/adminRouter');

// routes
app.use('/', userRouter);
app.use('/', requestRouter);
app.use('/', donationRouter);
app.use('/', hospitalRouter);
app.use('/', notificationRouter);
app.use('/', statsRouter);
app.use('/', adminRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
  });
});

// mongodb connection and server start
let server;
connectDB()
  .then(async () => {
    // Ensure default system administrator exists in database
    await ensureAdminUser();

    // Start background timeout escalation worker
    startTimeoutWorker();

    server = app.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
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

// graceful shutdown
const handleShutdown = () => {
  console.log('🛑 Shutting down server...');
  stopTimeoutWorker();
  server?.close(() => process.exit(0));
};

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
// reload trigger
