const mongoose = require('mongoose');

const apiLogSchema = new mongoose.Schema({
  endpoint: String,
  method: String,
  statusCode: Number,
  responseTime: Number,
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  ipAddress: String,
  userAgent: String,
  requestBody: mongoose.Schema.Types.Mixed,
  responseSize: Number,
  error: String,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

const errorLogSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['application', 'database', 'validation', 'authentication', 'external_api'],
    required: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    required: true
  },
  message: String,
  stack: String,
  endpoint: String,
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  metadata: mongoose.Schema.Types.Mixed,
  resolved: {
    type: Boolean,
    default: false
  },
  resolvedAt: Date,
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: String,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

const systemHealthSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  cpu: {
    usage: Number,
    cores: Number
  },
  memory: {
    used: Number,
    total: Number,
    percentage: Number
  },
  disk: {
    used: Number,
    total: Number,
    percentage: Number
  },
  database: {
    connections: Number,
    responseTime: Number,
    status: String
  },
  cache: {
    hits: Number,
    misses: Number,
    hitRate: Number,
    memory: Number
  },
  api: {
    requestsPerMinute: Number,
    averageResponseTime: Number,
    errorRate: Number
  },
  services: [{
    name: String,
    status: String,
    responseTime: Number,
    lastCheck: Date
  }]
});

const feedbackSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  type: {
    type: String,
    enum: ['bug', 'feature', 'improvement', 'complaint', 'praise'],
    required: true
  },
  category: String,
  subject: String,
  message: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  page: String,
  screenshot: String,
  metadata: mongoose.Schema.Types.Mixed,
  status: {
    type: String,
    enum: ['pending', 'in_review', 'resolved', 'rejected'],
    default: 'pending'
  },
  response: String,
  respondedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  respondedAt: Date,
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  }
}, {
  timestamps: true
});

const activeUserSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sessionId: String,
  lastActivity: {
    type: Date,
    default: Date.now,
    index: true
  },
  activities: [{
    type: String,
    timestamp: Date,
    metadata: mongoose.Schema.Types.Mixed
  }],
  pages: [{
    path: String,
    visitedAt: Date,
    duration: Number
  }],
  deviceInfo: {
    type: String,
    browser: String,
    os: String,
    isMobile: Boolean
  },
  location: {
    country: String,
    city: String,
    region: String
  }
});

const securityEventSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['login_attempt', 'suspicious_activity', 'blocked_ip', 'rate_limit', 'injection_attempt'],
    required: true
  },
  severity: {
    type: String,
    enum: ['info', 'warning', 'danger'],
    required: true
  },
  ipAddress: String,
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  details: mongoose.Schema.Types.Mixed,
  action: String,
  blocked: Boolean,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

const monitoringSchema = new mongoose.Schema({
  apiLogs: [apiLogSchema],
  errorLogs: [errorLogSchema],
  systemHealth: [systemHealthSchema],
  feedback: [feedbackSchema],
  activeUsers: [activeUserSchema],
  securityEvents: [securityEventSchema]
});

monitoringSchema.index({ 'apiLogs.timestamp': -1 });
monitoringSchema.index({ 'errorLogs.timestamp': -1, 'errorLogs.resolved': 1 });
monitoringSchema.index({ 'activeUsers.lastActivity': -1 });
monitoringSchema.index({ 'securityEvents.timestamp': -1, 'securityEvents.type': 1 });

module.exports = mongoose.model('Monitoring', monitoringSchema);