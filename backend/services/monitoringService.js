const Monitoring = require('../models/Monitoring');
const os = require('os');
const mongoose = require('mongoose');

class MonitoringService {
  constructor() {
    this.apiMetrics = new Map();
    this.activeUsers = new Map();
  }

  async logAPICall(req, res, responseTime) {
    const log = {
      endpoint: req.originalUrl,
      method: req.method,
      statusCode: res.statusCode,
      responseTime,
      userId: req.userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestBody: this.sanitizeRequestBody(req.body),
      responseSize: res.get('content-length'),
      timestamp: new Date()
    };
    
    if (res.statusCode >= 400) {
      log.error = res.locals.error;
    }
    
    await Monitoring.findOneAndUpdate(
      {},
      {
        $push: {
          apiLogs: {
            $each: [log],
            $sort: { timestamp: -1 },
            $slice: 10000
          }
        }
      },
      { upsert: true }
    );
    
    this.updateAPIMetrics(req.originalUrl, responseTime, res.statusCode);
  }

  sanitizeRequestBody(body) {
    const sanitized = { ...body };
    const sensitiveFields = ['password', 'token', 'creditCard', 'cvv', 'ssn'];
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    });
    
    return sanitized;
  }

  updateAPIMetrics(endpoint, responseTime, statusCode) {
    const metrics = this.apiMetrics.get(endpoint) || {
      calls: 0,
      totalTime: 0,
      errors: 0
    };
    
    metrics.calls++;
    metrics.totalTime += responseTime;
    if (statusCode >= 400) metrics.errors++;
    
    this.apiMetrics.set(endpoint, metrics);
  }

  async logError(error, context = {}) {
    const errorLog = {
      type: this.determineErrorType(error),
      severity: this.determineErrorSeverity(error),
      message: error.message,
      stack: error.stack,
      endpoint: context.endpoint,
      userId: context.userId,
      metadata: {
        ...context,
        timestamp: new Date()
      }
    };
    
    await Monitoring.findOneAndUpdate(
      {},
      {
        $push: {
          errorLogs: {
            $each: [errorLog],
            $sort: { timestamp: -1 },
            $slice: 5000
          }
        }
      },
      { upsert: true }
    );
    
    if (errorLog.severity === 'critical') {
      await this.alertAdmins(errorLog);
    }
  }

  determineErrorType(error) {
    if (error.name === 'ValidationError') return 'validation';
    if (error.name === 'MongoError') return 'database';
    if (error.name === 'UnauthorizedError') return 'authentication';
    if (error.code === 'ECONNREFUSED') return 'external_api';
    return 'application';
  }

  determineErrorSeverity(error) {
    if (error.statusCode >= 500) return 'critical';
    if (error.statusCode >= 400) return 'high';
    if (error.name === 'ValidationError') return 'low';
    return 'medium';
  }

  async collectSystemHealth() {
    const cpuUsage = process.cpuUsage();
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    
    const health = {
      cpu: {
        usage: (cpuUsage.user + cpuUsage.system) / 1000000,
        cores: os.cpus().length
      },
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal * 100).toFixed(2)
      },
      disk: await this.getDiskUsage(),
      database: await this.checkDatabaseHealth(),
      cache: await this.getCacheStats(),
      api: this.getAPIStats(),
      services: await this.checkExternalServices()
    };
    
    await Monitoring.findOneAndUpdate(
      {},
      {
        $push: {
          systemHealth: {
            $each: [health],
            $sort: { timestamp: -1 },
            $slice: 1440
          }
        }
      },
      { upsert: true }
    );
    
    return health;
  }

  async getDiskUsage() {
    return {
      used: 50000000000,
      total: 100000000000,
      percentage: 50
    };
  }

  async checkDatabaseHealth() {
    const start = Date.now();
    
    try {
      await mongoose.connection.db.admin().ping();
      const responseTime = Date.now() - start;
      
      return {
        connections: mongoose.connections.length,
        responseTime,
        status: 'healthy'
      };
    } catch (error) {
      return {
        connections: 0,
        responseTime: -1,
        status: 'unhealthy'
      };
    }
  }

  async getCacheStats() {
    const redis = require('../config/redis');
    
    try {
      const info = await redis.info('stats');
      const stats = this.parseRedisInfo(info);
      
      return {
        hits: parseInt(stats.keyspace_hits || 0),
        misses: parseInt(stats.keyspace_misses || 0),
        hitRate: this.calculateHitRate(stats.keyspace_hits, stats.keyspace_misses),
        memory: parseInt(stats.used_memory || 0)
      };
    } catch (error) {
      return {
        hits: 0,
        misses: 0,
        hitRate: 0,
        memory: 0
      };
    }
  }

  parseRedisInfo(info) {
    const stats = {};
    info.split('\r\n').forEach(line => {
      const [key, value] = line.split(':');
      if (key && value) {
        stats[key] = value;
      }
    });
    return stats;
  }

  calculateHitRate(hits, misses) {
    const total = parseInt(hits || 0) + parseInt(misses || 0);
    if (total === 0) return 0;
    return (parseInt(hits || 0) / total * 100).toFixed(2);
  }

  getAPIStats() {
    let totalCalls = 0;
    let totalTime = 0;
    let totalErrors = 0;
    
    this.apiMetrics.forEach(metrics => {
      totalCalls += metrics.calls;
      totalTime += metrics.totalTime;
      totalErrors += metrics.errors;
    });
    
    return {
      requestsPerMinute: totalCalls,
      averageResponseTime: totalCalls > 0 ? totalTime / totalCalls : 0,
      errorRate: totalCalls > 0 ? (totalErrors / totalCalls * 100).toFixed(2) : 0
    };
  }

  async checkExternalServices() {
    const services = [
      { name: 'Stripe', url: 'https://api.stripe.com', critical: true },
      { name: 'PayPal', url: 'https://api.paypal.com', critical: true },
      { name: 'SendGrid', url: 'https://api.sendgrid.com', critical: false },
      { name: 'Cloudinary', url: 'https://api.cloudinary.com', critical: false }
    ];
    
    const results = await Promise.all(
      services.map(service => this.checkService(service))
    );
    
    return results;
  }

  async checkService(service) {
    const start = Date.now();
    
    try {
      const axios = require('axios');
      await axios.head(service.url, { timeout: 5000 });
      
      return {
        name: service.name,
        status: 'operational',
        responseTime: Date.now() - start,
        lastCheck: new Date()
      };
    } catch (error) {
      return {
        name: service.name,
        status: service.critical ? 'critical' : 'degraded',
        responseTime: -1,
        lastCheck: new Date()
      };
    }
  }

  async trackActiveUser(userId, activity) {
    const user = this.activeUsers.get(userId) || {
      userId,
      lastActivity: new Date(),
      activities: [],
      pages: []
    };
    
    user.lastActivity = new Date();
    user.activities.push({
      type: activity.type,
      timestamp: new Date(),
      metadata: activity.metadata
    });
    
    if (user.activities.length > 100) {
      user.activities = user.activities.slice(-100);
    }
    
    this.activeUsers.set(userId, user);
    
    await Monitoring.findOneAndUpdate(
      { 'activeUsers.userId': userId },
      {
        $set: {
          'activeUsers.$': user
        }
      },
      { upsert: true }
    );
  }

  async getActiveUsersCount(minutes = 30) {
    const threshold = new Date(Date.now() - minutes * 60 * 1000);
    
    const count = await Monitoring.aggregate([
      { $unwind: '$activeUsers' },
      {
        $match: {
          'activeUsers.lastActivity': { $gte: threshold }
        }
      },
      {
        $count: 'active'
      }
    ]);
    
    return count[0]?.active || 0;
  }

  async collectUserFeedback(feedback) {
    await Monitoring.findOneAndUpdate(
      {},
      {
        $push: {
          feedback: feedback
        }
      },
      { upsert: true }
    );
    
    if (feedback.priority === 'urgent') {
      await this.alertAdmins({
        type: 'urgent_feedback',
        feedback
      });
    }
  }

  async alertAdmins(alert) {
    console.log('ADMIN ALERT:', alert);
  }

  async generateHealthReport() {
    const health = await this.collectSystemHealth();
    const activeUsers = await this.getActiveUsersCount();
    const apiStats = this.getAPIStats();
    
    const status = this.determineOverallHealth(health, apiStats);
    
    return {
      status,
      timestamp: new Date(),
      health,
      activeUsers,
      apiStats,
      alerts: await this.getActiveAlerts()
    };
  }

  determineOverallHealth(health, apiStats) {
    if (health.database.status !== 'healthy') return 'critical';
    if (health.memory.percentage > 90) return 'warning';
    if (apiStats.errorRate > 10) return 'warning';
    if (health.cpu.usage > 80) return 'warning';
    return 'healthy';
  }

  async getActiveAlerts() {
    const alerts = [];
    
    const criticalErrors = await Monitoring.aggregate([
      { $unwind: '$errorLogs' },
      {
        $match: {
          'errorLogs.severity': 'critical',
          'errorLogs.resolved': false,
          'errorLogs.timestamp': { $gte: new Date(Date.now() - 3600000) }
        }
      }
    ]);
    
    if (criticalErrors.length > 0) {
      alerts.push({
        type: 'critical_errors',
        count: criticalErrors.length,
        severity: 'critical'
      });
    }
    
    return alerts;
  }
}

module.exports = new MonitoringService();