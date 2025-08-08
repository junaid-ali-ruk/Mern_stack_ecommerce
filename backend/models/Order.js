const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const addressSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['billing', 'shipping'],
    required: true
  },
  fullName: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  email: String,
  addressLine1: {
    type: String,
    required: true
  },
  addressLine2: String,
  city: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  postalCode: {
    type: String,
    required: true
  },
  country: {
    type: String,
    required: true,
    default: 'US'
  },
  landmark: String,
  instructions: String,
  isDefault: {
    type: Boolean,
    default: false
  }
});

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  variant: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'product.variants'
  },
  productSnapshot: {
    name: String,
    sku: String,
    image: String,
    category: String
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  },
  comparePrice: Number,
  discount: {
    amount: Number,
    percentage: Number,
    code: String
  },
  tax: {
    rate: Number,
    amount: Number
  },
  subtotal: Number,
  total: Number,
  fulfillmentStatus: {
    type: String,
    enum: ['pending', 'processing', 'packed', 'shipped', 'delivered', 'returned', 'refunded'],
    default: 'pending'
  },
  trackingInfo: {
    carrier: String,
    trackingNumber: String,
    trackingUrl: String,
    shippedAt: Date,
    deliveredAt: Date
  },
  returnInfo: {
    requested: Boolean,
    requestedAt: Date,
    reason: String,
    status: String,
    refundAmount: Number,
    refundedAt: Date
  },
  customization: Map,
  gift: {
    isGift: Boolean,
    message: String,
    wrapping: String
  }
});

const statusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  note: String,
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  metadata: Map
});

const refundSchema = new mongoose.Schema({
  requestedAt: {
    type: Date,
    default: Date.now
  },
  reason: {
    type: String,
    required: true
  },
  description: String,
  items: [{
    orderItem: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    quantity: Number,
    amount: Number
  }],
  totalAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'processing', 'completed'],
    default: 'pending'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  processedAt: Date,
  refundMethod: {
    type: String,
    enum: ['original_payment', 'store_credit', 'bank_transfer']
  },
  refundReference: String,
  notes: String
});

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  items: [orderItemSchema],
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending',
    index: true
  },
  statusHistory: [statusHistorySchema],
  payment: {
    method: {
      type: String,
      enum: ['card', 'paypal', 'stripe', 'cod', 'bank_transfer', 'wallet'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded'],
      default: 'pending'
    },
    transactionId: String,
    paymentIntentId: String,
    paidAt: Date,
    paymentDetails: Map,
    refunds: [refundSchema]
  },
  pricing: {
    subtotal: {
      type: Number,
      required: true
    },
    discount: {
      amount: {
        type: Number,
        default: 0
      },
      codes: [{
        code: String,
        amount: Number,
        type: String
      }]
    },
    tax: {
      rate: Number,
      amount: Number
    },
    shipping: {
      method: String,
      carrier: String,
      cost: Number,
      estimatedDays: Number
    },
    total: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'USD'
    }
  },
  addresses: {
    billing: addressSchema,
    shipping: addressSchema
  },
  fulfillment: {
    type: {
      type: String,
      enum: ['delivery', 'pickup', 'digital'],
      default: 'delivery'
    },
    status: {
      type: String,
      enum: ['unfulfilled', 'partially_fulfilled', 'fulfilled', 'returned'],
      default: 'unfulfilled'
    },
    trackingNumber: String,
    carrier: String,
    trackingUrl: String,
    shippedAt: Date,
    deliveredAt: Date,
    expectedDelivery: Date,
    pickupLocation: {
      store: String,
      address: String,
      pickupCode: String,
      pickupBy: Date
    }
  },
  invoice: {
    number: String,
    generatedAt: Date,
    url: String,
    sentAt: Date
  },
  notes: {
    customer: String,
    internal: String,
    delivery: String
  },
  metadata: {
    source: {
      type: String,
      enum: ['web', 'mobile', 'api', 'admin', 'pos'],
      default: 'web'
    },
    deviceType: String,
    ipAddress: String,
    userAgent: String,
    affiliateCode: String,
    utmParams: {
      source: String,
      medium: String,
      campaign: String
    }
  },
  flags: {
    isFirstOrder: Boolean,
    isPriority: Boolean,
    requiresReview: Boolean,
    fraudAlert: Boolean,
    giftOrder: Boolean
  },
  cancelledAt: Date,
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancellationReason: String
}, {
  timestamps: true
});

orderSchema.index({ orderNumber: 1 });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'payment.status': 1 });
orderSchema.index({ 'fulfillment.status': 1 });
orderSchema.index({ createdAt: -1 });

orderSchema.pre('save', async function(next) {
  if (this.isNew) {
    this.orderNumber = await this.generateOrderNumber();
    
    this.statusHistory.push({
      status: this.status,
      note: 'Order created'
    });
    
    for (const item of this.items) {
      item.subtotal = item.price * item.quantity;
      item.tax.amount = item.subtotal * (item.tax.rate || 0);
      item.total = item.subtotal + item.tax.amount - (item.discount?.amount || 0);
    }
  } else if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date()
    });
  }
  
  next();
});

orderSchema.methods.generateOrderNumber = async function() {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = nanoid(6).toUpperCase();
  
  return `ORD-${year}${month}${day}-${random}`;
};

orderSchema.methods.canBeCancelled = function() {
  const nonCancellableStatuses = ['shipped', 'delivered', 'cancelled', 'refunded'];
  return !nonCancellableStatuses.includes(this.status);
};

orderSchema.methods.cancel = async function(userId, reason) {
  if (!this.canBeCancelled()) {
    throw new Error('Order cannot be cancelled in current status');
  }
  
  this.status = 'cancelled';
  this.cancelledAt = new Date();
  this.cancelledBy = userId;
  this.cancellationReason = reason;
  
  this.statusHistory.push({
    status: 'cancelled',
    note: reason,
    updatedBy: userId
  });
  
  const stockService = require('../services/stockService');
  const itemsToRelease = this.items.map(item => ({
    productId: item.product,
    variantId: item.variant,
    quantity: item.quantity
  }));
  
  await stockService.releaseStock(itemsToRelease);
  
  if (this.payment.status === 'completed') {
    this.payment.status = 'pending_refund';
  }
  
  await this.save();
  return this;
};

orderSchema.methods.updateStatus = async function(newStatus, note, userId) {
  const validTransitions = {
    'pending': ['confirmed', 'cancelled'],
    'confirmed': ['processing', 'cancelled'],
    'processing': ['shipped', 'cancelled'],
    'shipped': ['delivered', 'returned'],
    'delivered': ['refunded'],
    'cancelled': [],
    'refunded': []
  };
  
  if (!validTransitions[this.status]?.includes(newStatus)) {
    throw new Error(`Cannot transition from ${this.status} to ${newStatus}`);
  }
  
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    note,
    updatedBy: userId
  });
  
  if (newStatus === 'shipped') {
    this.fulfillment.shippedAt = new Date();
    this.fulfillment.status = 'fulfilled';
  } else if (newStatus === 'delivered') {
    this.fulfillment.deliveredAt = new Date();
  }
  
  await this.save();
  return this;
};

orderSchema.methods.requestRefund = async function(refundData) {
  if (!['delivered', 'shipped'].includes(this.status)) {
    throw new Error('Refund can only be requested for delivered or shipped orders');
  }
  
  const refund = {
    reason: refundData.reason,
    description: refundData.description,
    items: refundData.items || this.items.map(item => ({
      orderItem: item._id,
      quantity: item.quantity,
      amount: item.total
    })),
    totalAmount: refundData.totalAmount || this.pricing.total,
    status: 'pending'
  };
  
  this.payment.refunds.push(refund);
  
  if (refundData.fullRefund) {
    this.status = 'refunded';
    this.payment.status = 'refunded';
  } else {
    this.payment.status = 'partially_refunded';
  }
  
  await this.save();
  return refund;
};

orderSchema.methods.processRefund = async function(refundId, approved, userId, notes) {
  const refund = this.payment.refunds.id(refundId);
  
  if (!refund) {
    throw new Error('Refund request not found');
  }
  
  if (refund.status !== 'pending') {
    throw new Error('Refund has already been processed');
  }
  
  if (approved) {
    refund.status = 'approved';
    refund.approvedBy = userId;
    refund.approvedAt = new Date();
    refund.notes = notes;
    
    const paymentService = require('../services/paymentService');
    const refundResult = await paymentService.processRefund(
      this.payment.transactionId,
      refund.totalAmount
    );
    
    refund.status = 'completed';
    refund.processedAt = new Date();
    refund.refundReference = refundResult.refundId;
  } else {
    refund.status = 'rejected';
    refund.notes = notes;
  }
  
  await this.save();
  return refund;
};

orderSchema.methods.generateInvoiceData = function() {
  return {
    orderNumber: this.orderNumber,
    orderDate: this.createdAt,
    customer: {
      name: this.addresses.billing.fullName,
      email: this.addresses.billing.email,
      phone: this.addresses.billing.phone,
      address: {
        line1: this.addresses.billing.addressLine1,
        line2: this.addresses.billing.addressLine2,
        city: this.addresses.billing.city,
        state: this.addresses.billing.state,
        postalCode: this.addresses.billing.postalCode,
        country: this.addresses.billing.country
      }
    },
    items: this.items.map(item => ({
      name: item.productSnapshot.name,
      sku: item.productSnapshot.sku,
      quantity: item.quantity,
      price: item.price,
      discount: item.discount?.amount || 0,
      tax: item.tax.amount,
      total: item.total
    })),
    pricing: this.pricing,
    paymentMethod: this.payment.method,
    paymentStatus: this.payment.status
  };
};

orderSchema.statics.getOrderStats = async function(userId, period = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);
  
  const stats = await this.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalSpent: { $sum: '$pricing.total' },
        averageOrderValue: { $avg: '$pricing.total' },
        totalItems: { $sum: { $size: '$items' } },
        completedOrders: {
          $sum: {
            $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0]
          }
        },
        cancelledOrders: {
          $sum: {
            $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0]
          }
        }
      }
    }
  ]);
  
  return stats[0] || {
    totalOrders: 0,
    totalSpent: 0,
    averageOrderValue: 0,
    totalItems: 0,
    completedOrders: 0,
    cancelledOrders: 0
  };
};

module.exports = mongoose.model('Order', orderSchema);