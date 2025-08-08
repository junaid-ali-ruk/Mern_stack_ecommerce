const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['pageview', 'click', 'purchase', 'cart_add', 'cart_remove', 'search', 'filter'],
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  sessionId: String,
  data: {
    page: String,
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
    },
    searchQuery: String,
    filters: Map,
    value: Number,
    currency: String
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    referrer: String,
    device: String,
    browser: String,
    os: String,
    country: String,
    city: String
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

const kpiSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    required: true
  },
  metrics: {
    revenue: {
      total: Number,
      orders: Number,
      averageOrderValue: Number,
      currency: String
    },
    orders: {
      total: Number,
      completed: Number,
      cancelled: Number,
      returned: Number,
      conversionRate: Number
    },
    customers: {
      new: Number,
      returning: Number,
      active: Number,
      churnRate: Number,
      lifetimeValue: Number
    },
    products: {
      sold: Number,
      views: Number,
      conversionRate: Number,
      averageRating: Number,
      outOfStock: Number
    },
    traffic: {
      visitors: Number,
      pageviews: Number,
      sessions: Number,
      bounceRate: Number,
      averageSessionDuration: Number
    },
    marketing: {
      emailSent: Number,
      emailOpened: Number,
      emailClicked: Number,
      socialShares: Number,
      affiliateSales: Number
    }
  },
  comparisons: {
    previousPeriod: {
      revenue: Number,
      orders: Number,
      customers: Number
    },
    yearOverYear: {
      revenue: Number,
      orders: Number,
      customers: Number
    }
  }
});

const customerAnalyticsSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  metrics: {
    totalOrders: Number,
    totalSpent: Number,
    averageOrderValue: Number,
    lastOrderDate: Date,
    firstOrderDate: Date,
    daysSinceLastOrder: Number,
    preferredCategories: [String],
    preferredBrands: [String],
    preferredPaymentMethod: String,
    returnRate: Number,
    reviewCount: Number,
    referralCount: Number
  },
  segments: [String],
  scores: {
    lifetime: Number,
    frequency: Number,
    monetary: Number,
    recency: Number,
    engagement: Number,
    loyalty: Number,
    churnRisk: Number
  },
  predictions: {
    nextPurchaseDate: Date,
    nextPurchaseValue: Number,
    churnProbability: Number,
    lifetimeValue: Number,
    recommendedProducts: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      },
      score: Number
    }]
  },
  cohort: {
    month: String,
    year: Number,
    week: Number
  }
});

const analyticsSchema = new mongoose.Schema({
  events: [analyticsEventSchema],
  kpis: [kpiSchema],
  customerAnalytics: [customerAnalyticsSchema]
});

analyticsSchema.index({ 'events.timestamp': -1 });
analyticsSchema.index({ 'events.type': 1, 'events.timestamp': -1 });
analyticsSchema.index({ 'kpis.date': -1, 'kpis.type': 1 });

module.exports = mongoose.model('Analytics', analyticsSchema);