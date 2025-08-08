const compression = require('compression');
const responseTime = require('response-time');
const monitoringService = require('../services/monitoringService');
const cacheService = require('../services/cacheService');

const compressionMiddleware = compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6
});

const responseTimeMiddleware = responseTime((req, res, time) => {
  res.setHeader('X-Response-Time', `${time}ms`);
  
  if (time > 1000) {
    console.warn(`Slow API: ${req.method} ${req.url} took ${time}ms`);
  }
  
  monitoringService.logAPICall(req, res, time);
});

const cacheMiddleware = (options = {}) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }
    
    const key = cacheService.generateKey(
      'api',
      req.originalUrl,
      req.user?.id || 'anonymous'
    );
    
    const cached = await cacheService.get(key);
    
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }
    
    res.setHeader('X-Cache', 'MISS');
    
    const originalJson = res.json;
    res.json = function(data) {
      if (res.statusCode === 200) {
        cacheService.set(key, data, options.ttl || 300);
      }
      originalJson.call(this, data);
    };
    
    next();
  };
};

const conditionalCache = (condition) => {
  return (req, res, next) => {
    if (condition(req)) {
      return cacheMiddleware()(req, res, next);
    }
    next();
  };
};

const clearCache = (pattern) => {
  return async (req, res, next) => {
    await cacheService.invalidate(pattern || '*');
    next();
  };
};

module.exports = {
  compressionMiddleware,
  responseTimeMiddleware,
  cacheMiddleware,
  conditionalCache,
  clearCache
};