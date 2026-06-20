
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
const notificationRouter = require('./src/routes/notificationRouter');

const PORT = process.env.PORT || 3000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const rootDir = path.resolve();
const app = express();

// middlewares
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(rootDir, 'public')));
app.use(cookieParser()); // enables req.cookies anywhere downstream

// routes
app.use('/', userRouter);
app.use('/', requestRouter);
app.use('/', donationRouter);
app.use('/', notificationRouter);

// 404 handler (no route matched)
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// global error handler (catches errors passed via next(err))
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
  });
});

// mongodb connection and server start
let server;
connectDB()
  .then(() => {
    server = app.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to connect to the database. Server not started.', error);
    process.exit(1);
  });

// graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down server...');
  server?.close(() => process.exit(0));
});