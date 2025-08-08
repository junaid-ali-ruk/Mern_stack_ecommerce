const Monitoring = require('../models/Monitoring');
const crypto = require('crypto');
const geoip = require('geoip-lite');

class SecurityService {
  constructor() {
    this.blockedIPs = new Set();
    this.suspiciousPatterns = [
      /(<script|javascript:|onerror=|onclick=)/gi,
      /(union|select|insert|update|delete|drop)\s/gi,
      /(\$where|\$regex|\$ne|\$gt|\$lt)/gi,
      /(\.\.\/|\.\/)/gi,
      /(%00|%0d%0a|%27|%3C|%3E)/gi
    ];
    this.ipAttempts = new Map();
  }

  async checkSuspiciousActivity(req) {
    const ip = this.getClientIP(req);
    const patterns = this.detectSuspiciousPatterns(req);
    
    if (patterns.length > 0) {
      await this.logSecurityEvent({
        type: 'suspicious_activity',
        severity: 'warning',
        ipAddress: ip,
        userId: req.userId,
        timestamp: new Date(),
        details: {
          patterns,
          url: req.originalUrl,
          method: req.method,
          body: req.body,
          query: req.query
        }
      });
      
      return {
        suspicious: true,
        patterns,
        shouldBlock: patterns.length > 2
      };
    }
    
    return { suspicious: false };
  }

  detectSuspiciousPatterns(req) {
    const patterns = [];
    const checkString = JSON.stringify({
      body: req.body,
      query: req.query,
      params: req.params
    });

    this.suspiciousPatterns.forEach((pattern, index) => {
      if (pattern.test(checkString)) {
        patterns.push({
          type: this.getPatternType(index),
          matched: checkString.match(pattern)
        });
      }
    });

    return patterns;
  }

  getPatternType(index) {
    const types = [
      'XSS_ATTEMPT',
      'SQL_INJECTION',
      'NOSQL_INJECTION',
      'PATH_TRAVERSAL',
      'URL_ENCODING'
    ];
    return types[index] || 'UNKNOWN';
  }

  async trackIPActivity(ip) {
    const key = `ip_${ip}`;
    const attempts = this.ipAttempts.get(key) || { count: 0, firstAttempt: Date.now() };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    this.ipAttempts.set(key, attempts);

    const timeWindow = attempts.lastAttempt - attempts.firstAttempt;

    if (attempts.count > 100 && timeWindow < 60000) {
      await this.blockIP(ip, 'Rate limit exceeded');
      return { blocked: true, reason: 'rate_limit' };
    }

    if (attempts.count > 500) {
      await this.blockIP(ip, 'Excessive requests');
      return { blocked: true, reason: 'excessive_requests' };
    }

    return { blocked: false };
  }

  async blockIP(ip, reason) {
    this.blockedIPs.add(ip);

    await this.logSecurityEvent({
      type: 'blocked_ip',
      severity: 'danger',
      ipAddress: ip,
      timestamp: new Date(),
      details: { reason },
      blocked: true
    });

    setTimeout(() => {
      this.blockedIPs.delete(ip);
      this.ipAttempts.delete(`ip_${ip}`);
    }, 3600000); // 1 hour
  }

  isIPBlocked(ip) {
    return this.blockedIPs.has(ip);
  }

  getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.ip;
  }

  async logSecurityEvent(event) {
    await Monitoring.findOneAndUpdate(
      {},
      {
        $push: {
          securityEvents: {
            $each: [event],
            $sort: { timestamp: -1 },
            $slice: 10000
          }
        }
      },
      { upsert: true }
    );
  }

  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .trim();
  }

  generateCSRFToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  validateCSRFToken(token, sessionToken) {
    return token === sessionToken;
  }

  encryptSensitiveData(data, key = process.env.ENCRYPTION_KEY) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  decryptSensitiveData(encryptedData, key = process.env.ENCRYPTION_KEY) {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encrypted = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }

  async detectBruteForce(identifier, action) {
    const key = `brute_${identifier}_${action}`;
    const attempts = this.ipAttempts.get(key) || { count: 0, firstAttempt: Date.now() };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    this.ipAttempts.set(key, attempts);

    const timeWindow = attempts.lastAttempt - attempts.firstAttempt;

    if (attempts.count > 5 && timeWindow < 300000) {
      return {
        detected: true,
        attempts: attempts.count,
        shouldLock: attempts.count > 10
      };
    }

    if (timeWindow > 3600000) {
      this.ipAttempts.delete(key);
    }

    return { detected: false };
  }

  async scanForVulnerabilities(req) {
    const vulnerabilities = [];

    if (!req.secure && process.env.NODE_ENV === 'production') {
      vulnerabilities.push({
        type: 'INSECURE_CONNECTION',
        severity: 'high',
        message: 'Request not using HTTPS'
      });
    }

    if (req.headers['x-powered-by']) {
      vulnerabilities.push({
        type: 'INFORMATION_DISCLOSURE',
        severity: 'low',
        message: 'X-Powered-By header exposed'
      });
    }

    if (req.method === 'POST' && !req.headers['content-type']) {
      vulnerabilities.push({
        type: 'MISSING_CONTENT_TYPE',
        severity: 'medium',
        message: 'POST request without Content-Type header'
      });
    }

    return vulnerabilities;
  }

  generateSecurityHeaders() {
    return {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    };
  }
}

module.exports = new SecurityService();
