const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['card', 'bank', 'wallet', 'paypal'],
    required: true
  },
  provider: {
    type: String,
    enum: ['stripe', 'paypal', 'razorpay', 'square'],
    required: true
  },
  tokenId: String,
  customerId: String,
  last4: String,
  brand: String,
  expiryMonth: Number,
  expiryYear: Number,
  holderName: String,
  email: String,
  isDefault: Boolean,
  metadata: Map
});

const transactionSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['payment', 'refund', 'partial_refund', 'authorization', 'capture'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    required: true
  },
  method: paymentMethodSchema,
  amount: {
    value: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'USD'
    },
    exchangeRate: Number,
    originalAmount: Number,
    originalCurrency: String
  },
  fees: {
    platform: Number,
    gateway: Number,
    tax: Number,
    total: Number
  },
  gateway: {
    provider: String,
    transactionId: String,
    referenceId: String,
    paymentIntentId: String,
    authorizationCode: String,
    captureId: String,
    responseCode: String,
    responseMessage: String,
    rawResponse: mongoose.Schema.Types.Mixed
  },
  verification: {
    cvvCheck: String,
    addressCheck: String,
    postalCheck: String,
    fraudScore: Number,
    fraudDetails: Map
  },
  timeline: [{
    status: String,
    timestamp: Date,
    message: String,
    metadata: Map
  }],
  refunds: [{
    amount: Number,
    reason: String,
    refundId: String,
    status: String,
    processedAt: Date
  }],
  metadata: {
    ipAddress: String,
    userAgent: String,
    deviceId: String,
    sessionId: String,
    retryCount: Number,
    webhook: {
      received: Boolean,
      receivedAt: Date,
      eventId: String
    }
  },
  errorDetails: {
    code: String,
    message: String,
    details: Map
  }
}, {
  timestamps: true
});

transactionSchema.index({ order: 1 });
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ 'gateway.transactionId': 1 });
transactionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);