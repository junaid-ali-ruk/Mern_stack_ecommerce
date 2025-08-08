const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const slowDown = require('express-slow-down');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss');
const hpp = require('hpp');
const securityService = require('../services/securityService');
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
});

const createRateLimiter = (options = {}) => {
  return rateLimit({
    store: new RedisStore({
      client: redis,
      prefix: 'rate_limit:'
    }),
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: options.max || 100,
    message: options.message || 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    handler: async (req, res) => {
      await securityService.logSecurityEvent({
        type: 'rate_limit',
        severity: 'warning',
        ipAddress: securityService.getClientIP(req),
        userId: req.userId,
        details: {
          endpoint: req.originalUrl,
          method: req.method
        }
      });
      
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: req.rateLimit.resetTime
      });
    }
  });
};

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again later'
});

const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100
});

const strictLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: 'Rate limit exceeded for sensitive operation'
});

const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,
  delayMs: 500,
  maxDelayMs: 20000
});

const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

const sanitizeInput = (req, res, next) => {
  const sanitizeObject = (obj) => {
    for (let key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = xss(obj[key]);
        obj[key] = securityService.sanitizeInput(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  };
  
  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);
  
  next();
};

const checkSuspiciousActivity = async (req, res, next) => {
  const ip = securityService.getClientIP(req);
  
  if (securityService.isIPBlocked(ip)) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'Your IP has been blocked due to suspicious activity'
    });
  }
  
  const check = await securityService.checkSuspiciousActivity(req);
  
  if (check.suspicious && check.shouldBlock) {
    await securityService.blockIP(ip, 'Suspicious patterns detected');
    return res.status(403).json({
      error: 'Security violation',
      message: 'Suspicious activity detected'
    });
  }
  
  const ipTracking = await securityService.trackIPActivity(ip);
  
  if (ipTracking.blocked) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests from your IP'
    });
  }
  
  next();
};

const validateRequest = (schema) => {
  return async (req, res, next) => {
    try {
      const validated = await schema.validateAsync(
        {
          body: req.body,
          query: req.query,
          params: req.params
        },
        {
          abortEarly: false,
          stripUnknown: true
        }
      );
      
      req.body = validated.body;
      req.query = validated.query;
      req.params = validated.params;
      
      next();
    } catch (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      res.status(400).json({
        error: 'Validation failed',
        errors
      });
    }
  };
};

const fileUploadValidator = (options = {}) => {
  return (req, res, next) => {
    if (!req.files || req.files.length === 0) {
      return next();
    }
    
    const maxSize = options.maxSize || 5 * 1024 * 1024;
    const allowedTypes = options.allowedTypes || ['image/jpeg', 'image/png', 'image/gif'];
    const allowedExtensions = options.allowedExtensions || ['.jpg', '.jpeg', '.png', '.gif'];
    
    for (const file of req.files) {
      if (file.size > maxSize) {
        return res.status(400).json({
          error: 'File too large',
          message: `File ${file.originalname} exceeds maximum size of ${maxSize / 1024 / 1024}MB`
        });
      }
      
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          error: 'Invalid file type',
          message: `File type ${file.mimetype} is not allowed`
        });
      }
      
      const extension = path.extname(file.originalname).toLowerCase();
      if (!allowedExtensions.includes(extension)) {
        return res.status(400).json({
          error: 'Invalid file extension',
          message: `File extension ${extension} is not allowed`
        });
      }
      
      const fileTypeCheck = /^(image|application\/pdf|text\/csv)/.test(file.mimetype);
      if (!fileTypeCheck) {
        return res.status(400).json({
          error: 'Suspicious file',
          message: 'File appears to be malicious'
        });
      }
    }
    
    next();
  };
};

const csrfProtection = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const sessionToken = req.session?.csrfToken;
  
  if (!token || !sessionToken || !securityService.validateCSRFToken(token, sessionToken)) {
    return res.status(403).json({
      error: 'CSRF validation failed',
      message: 'Invalid or missing CSRF token'
    });
  }
  
  next();
};

const httpsRedirect = (req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
};

module.exports = {
  createRateLimiter,
  authLimiter,
  apiLimiter,
  strictLimiter,
  speedLimiter,
  securityHeaders,
  sanitizeInput,
  checkSuspiciousActivity,
  validateRequest,
  fileUploadValidator,
  csrfProtection,
  httpsRedirect,
  mongoSanitize,
  hpp
};