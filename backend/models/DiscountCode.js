const mongoose = require('mongoose');
const voucher = require('voucher-code-generator');

const discountCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    index: true
  },
  type: {
    type: String,
    enum: ['percentage', 'fixed', 'free_shipping', 'buy_x_get_y', 'bundle'],
    required: true
  },
  value: {
    type: Number,
    required: true
  },
  conditions: {
    minPurchase: {
      type: Number,
      default: 0
    },
    maxDiscount: Number,
    applicableProducts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }],
    applicableCategories: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
    }],
    excludedProducts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }],
    customerGroups: [{
      type: String,
      enum: ['new', 'returning', 'vip', 'wholesale']
    }],
    buyQuantity: Number,
    getQuantity: Number,
    bundleProducts: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      },
      quantity: Number
    }]
  },
  usage: {
    limit: {
      type: Number,
      default: null
    },
    used: {
      type: Number,
      default: 0
    },
    limitPerCustomer: {
      type: Number,
      default: 1
    },
    usedByCustomers: [{
      customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      count: Number,
      lastUsed: Date
    }]
  },
  validity: {
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    daysOfWeek: [Number],
    timeOfDay: {
      start: String,
      end: String
    },
    timezone: {
      type: String,
      default: 'UTC'
    }
  },
  metadata: {
    campaign: String,
    description: String,
    internalNotes: String,
    source: {
      type: String,
      enum: ['manual', 'campaign', 'loyalty', 'referral', 'compensation'],
      default: 'manual'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    tags: [String]
  },
  stackable: {
    type: Boolean,
    default: false
  },
  priority: {
    type: Number,
    default: 0
  },
  active: {
    type: Boolean,
    default: true,
    index: true
  },
  analytics: {
    revenue: {
      type: Number,
      default: 0
    },
    ordersCount: {
      type: Number,
      default: 0
    },
    totalDiscounted: {
      type: Number,
      default: 0
    },
    averageOrderValue: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

discountCodeSchema.index({ code: 1, active: 1 });
discountCodeSchema.index({ 'validity.startDate': 1, 'validity.endDate': 1 });
discountCodeSchema.index({ 'usage.used': 1, 'usage.limit': 1 });

discountCodeSchema.methods.isValid = function(customerId = null) {
  const now = new Date();
  
  if (!this.active) return { valid: false, reason: 'Code is inactive' };
  
  if (now < this.validity.startDate) {
    return { valid: false, reason: 'Code not yet valid' };
  }
  
  if (now > this.validity.endDate) {
    return { valid: false, reason: 'Code has expired' };
  }
  
  if (this.usage.limit && this.usage.used >= this.usage.limit) {
    return { valid: false, reason: 'Code usage limit reached' };
  }
  
  if (customerId && this.usage.limitPerCustomer) {
    const customerUsage = this.usage.usedByCustomers.find(
      u => u.customer.toString() === customerId.toString()
    );
    
    if (customerUsage && customerUsage.count >= this.usage.limitPerCustomer) {
      return { valid: false, reason: 'Customer usage limit reached' };
    }
  }
  
  if (this.validity.daysOfWeek && this.validity.daysOfWeek.length > 0) {
    const today = now.getDay();
    if (!this.validity.daysOfWeek.includes(today)) {
      return { valid: false, reason: 'Code not valid on this day' };
    }
  }
  
  return { valid: true };
};

discountCodeSchema.methods.calculateDiscount = function(cart, customerId = null) {
  const validation = this.isValid(customerId);
  if (!validation.valid) {
    return { success: false, message: validation.reason };
  }
  
  let discountAmount = 0;
  let applicableItems = [];
  
  if (this.conditions.minPurchase > 0 && cart.totals.subtotal < this.conditions.minPurchase) {
    return { 
      success: false, 
      message: `Minimum purchase of ${this.conditions.minPurchase} required` 
    };
  }
  
  switch (this.type) {
    case 'percentage':
      discountAmount = cart.totals.subtotal * (this.value / 100);
      if (this.conditions.maxDiscount) {
        discountAmount = Math.min(discountAmount, this.conditions.maxDiscount);
      }
      break;
      
    case 'fixed':
      discountAmount = Math.min(this.value, cart.totals.subtotal);
      break;
      
    case 'free_shipping':
      discountAmount = cart.totals.shipping;
      break;
      
    case 'buy_x_get_y':
      const eligibleItems = this.findEligibleBOGOItems(cart);
      discountAmount = this.calculateBOGODiscount(eligibleItems);
      applicableItems = eligibleItems.map(i => i._id);
      break;
      
    case 'bundle':
      const bundleDiscount = this.calculateBundleDiscount(cart);
      discountAmount = bundleDiscount.amount;
      applicableItems = bundleDiscount.items;
      break;
  }
  
  return {
    success: true,
    code: this.code,
    type: this.type,
    discountAmount,
    applicableItems,
    finalAmount: cart.totals.total - discountAmount
  };
};

discountCodeSchema.methods.findEligibleBOGOItems = function(cart) {
  return cart.items.filter(item => {
    if (this.conditions.applicableProducts.length > 0) {
      return this.conditions.applicableProducts.some(
        p => p.toString() === item.product.toString()
      );
    }
    if (this.conditions.applicableCategories.length > 0) {
      return this.conditions.applicableCategories.some(
        c => c.toString() === item.product.category.toString()
      );
    }
    return true;
  });
};

discountCodeSchema.methods.calculateBOGODiscount = function(items) {
  const buyQty = this.conditions.buyQuantity || 1;
  const getQty = this.conditions.getQuantity || 1;
  
  let totalDiscount = 0;
  
  items.forEach(item => {
    const sets = Math.floor(item.quantity / (buyQty + getQty));
    const freeItems = sets * getQty;
    totalDiscount += freeItems * item.price;
  });
  
  return totalDiscount;
};

discountCodeSchema.methods.calculateBundleDiscount = function(cart) {
  const requiredProducts = this.conditions.bundleProducts;
  const cartProductIds = cart.items.map(i => i.product.toString());
  
  const hasAllProducts = requiredProducts.every(req => 
    cartProductIds.includes(req.product.toString())
  );
  
  if (!hasAllProducts) {
    return { amount: 0, items: [] };
  }
  
  const bundleItems = requiredProducts.map(req => req.product.toString());
  const bundleSubtotal = cart.items
    .filter(item => bundleItems.includes(item.product.toString()))
    .reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  return {
    amount: bundleSubtotal * (this.value / 100),
    items: bundleItems
  };
};

discountCodeSchema.methods.recordUsage = async function(customerId, orderId, amount) {
  this.usage.used += 1;
  
  const customerUsage = this.usage.usedByCustomers.find(
    u => u.customer.toString() === customerId.toString()
  );
  
  if (customerUsage) {
    customerUsage.count += 1;
    customerUsage.lastUsed = new Date();
  } else {
    this.usage.usedByCustomers.push({
      customer: customerId,
      count: 1,
      lastUsed: new Date()
    });
  }
  
  this.analytics.ordersCount += 1;
  this.analytics.totalDiscounted += amount;
  this.analytics.revenue += amount;
  this.analytics.averageOrderValue = this.analytics.revenue / this.analytics.ordersCount;
  
  await this.save();
};

discountCodeSchema.statics.generateCode = function(options = {}) {
  const config = {
    length: options.length || 8,
    count: options.count || 1,
    charset: options.charset || 'alphanumeric',
    prefix: options.prefix || '',
    postfix: options.postfix || '',
    pattern: options.pattern || '########'
  };
  
  const codes = voucher.generate(config);
  return Array.isArray(codes) ? codes : [codes];
};

discountCodeSchema.statics.createBulkCodes = async function(baseConfig, count = 10) {
  const codes = this.generateCode({ count });
  const discounts = [];
  
  for (const code of codes) {
    const discount = await this.create({
      ...baseConfig,
      code
    });
    discounts.push(discount);
  }
  
  return discounts;
};

module.exports = mongoose.model('DiscountCode', discountCodeSchema);