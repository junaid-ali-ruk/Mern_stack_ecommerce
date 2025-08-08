import dotenv from "dotenv";
dotenv.config();

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.js";
import cartRoutes from "./routes/cart.js";
import wishlistRoutes from "./routes/wishlist.js";
import orderRoutes from "./routes/order.js";
import paymentRoutes from "./routes/payment.js";
import productRoutes from "./routes/product.js";
import oauthRoutes from "./routes/oauth.js";

try {
  await import("./config/passport.js");
  console.log('✅ Passport configuration loaded');
} catch (error) {
  console.error('⚠️  Error loading passport configuration:', error.message);
}

const app = express();

app.set("trust proxy", true);

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token']
}));

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many authentication attempts, please try again later.",
  skipSuccessfulRequests: true
});

app.use("/api/auth", authLimiter);
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      oauth: {
        google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        github: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
      },
      email: !!process.env.RESEND_API_KEY,
      payment: !!process.env.STRIPE_SECRET_KEY
    }
  });
});

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferMaxEntries: 0,
      bufferCommands: false,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected');
    });

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

connectDB();

try {
  app.use("/api/auth", authRoutes);
  app.use("/api/oauth", oauthRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/cart", cartRoutes);
  app.use("/api/wishlist", wishlistRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/payment", paymentRoutes);
  app.use("/api/user", cartRoutes);

  console.log('✅ All routes mounted successfully');
} catch (error) {
  console.error('❌ Error mounting routes:', error);
}

app.get("/", (req, res) => {
  res.json({
    message: "🚀 E-commerce API is running...",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      auth: "/api/auth",
      oauth: "/api/oauth",
      products: "/api/products",
      cart: "/api/cart",
      wishlist: "/api/wishlist",
      orders: "/api/orders",
      payment: "/api/payment"
    },
    documentation: {
      postman: "Import collection from /docs/postman.json",
      swagger: "Visit /docs for API documentation"
    }
  });
});

app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

app.use((err, req, res, next) => {
  console.error('Global error handler:', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      message: "Validation Error",
      errors
    });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} already exists`
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: "Invalid token"
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: "Token expired"
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: "Invalid ID format"
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      details: err
    })
  });
});

const gracefulShutdown = async () => {
  console.log('Shutting down gracefully...');
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
  } else {
    console.error('❌ Server error:', error);
  }
  process.exit(1);
});

export default app;