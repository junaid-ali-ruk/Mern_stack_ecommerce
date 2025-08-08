// Merged Express App with Monitoring, Queues, Analytics, Stripe, and Jobs

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const http = require('http');
const path = require('path');
const cors = require('cors');
const Bull = require('bull');
const statusMonitor = require('express-status-monitor');
 
const socketService = require('./services/socketService');
const monitoringService = require('./services/monitoringService');
const analyticsService = require('./services/analyticsService');
const { updateProductPrices, processAutoReplenish } = require('./jobs/priceUpdateJob');
const { cleanupCarts } = require('./jobs/cartCleanup');
const { sessionMiddleware } = require('./middleware/session');
const { updateCachedRates } = require('./services/currencyService');
const {
  securityHeaders,
  sanitizeInput,
  checkSuspiciousActivity,
  mongoSanitize,
  hpp,
  httpsRedirect
} = require('./middleware/security');
const {
  compressionMiddleware,
  responseTimeMiddleware
} = require('./middleware/performance');

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1);

// Stripe raw body handler
app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhooks/stripe') {
    req.rawBody = req.body;
  }
  next();
});

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(securityHeaders);
app.use(httpsRedirect);
app.use(compressionMiddleware);
app.use(responseTimeMiddleware);
app.use(mongoSanitize);
app.use(hpp());
app.use(sanitizeInput);
app.use(statusMonitor({
  title: 'E-Commerce API Status',
  path: '/status',
  spans: [{ interval: 1, retention: 60 }, { interval: 5, retention: 60 }, { interval: 15, retention: 60 }],
  chartVisibility: {
    cpu: true, mem: true, load: true, responseTime: true, rps: true, statusCodes: true
  },
  healthChecks: [{ protocol: 'http', host: 'localhost', path: '/api/health', port: process.env.PORT || 5000 }]
}));

// Database
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => { console.error('DB error:', err); process.exit(1); });

// Sessions
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI, touchAfter: 24 * 3600 }),
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 30 * 86400000, sameSite: 'strict' }
}));
app.use(sessionMiddleware);

// Suspicious Activity Check
app.use(checkSuspiciousActivity);

// Routes
app.use(mongoSanitize());
app.use(hpp());
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api', require('./routes/productRoutes'));
app.use('/api', require('./routes/cartRoutes'));
app.use('/api', require('./routes/enhancedCartRoutes'));
app.use('/api', require('./routes/orderRoutes'));
app.use('/api', require('./routes/enhancedOrderRoutes'));
app.use('/api', require('./routes/paymentExtendedRoutes'));
app.use('/api', require('./routes/advancedRoutes'));
app.use('/api/monitoring', require('./routes/monitoringRoutes'));

// Static
app.use('/uploads', express.static('uploads'));
app.use('/invoices', express.static(path.join(__dirname, 'uploads/invoices')));

// Socket.IO
socketService.initialize(server);

// Error handler
app.use(async (err, req, res, next) => {
  await monitoringService.logError(err, {
    endpoint: req.originalUrl,
    userId: req.userId,
    method: req.method
  });
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: `Cannot ${req.method} ${req.originalUrl}` });
});

// Queues
const paymentRetryQueue = new Bull('payment-retry', {
  redis: { host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 }
});

paymentRetryQueue.process(async (job) => {
  const { transactionId } = job.data;
  const paymentServiceExtended = require('./services/paymentServiceExtended');
  try {
    await paymentServiceExtended.retryFailedPayment(transactionId);
    return { success: true };
  } catch (error) {
    throw error;
  }
});



if (process.env.NODE_ENV === 'production') {
  updateProductPrices();
  processAutoReplenish();
  setInterval(updateCachedRates, 6 * 60 * 60 * 1000);
}

// Graceful Shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
async function gracefulShutdown() {
  console.log('Shutting down...');
  server.close(() => console.log('HTTP server closed'));
  await mongoose.connection.close();
  console.log('MongoDB disconnected');
  process.exit(0);
}

// Global Error Handling
process.on('unhandledRejection', async (err) => {
  console.error('Unhandled Rejection:', err);
  await monitoringService.logError(err, { type: 'unhandledRejection' });
});
process.on('uncaughtException', async (err) => {
  console.error('Uncaught Exception:', err);
  await monitoringService.logError(err, { type: 'uncaughtException' });
  process.exit(1);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Status Monitor: http://localhost:${PORT}/status`);
});