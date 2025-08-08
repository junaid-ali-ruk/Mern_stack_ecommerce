const mongoose = require('mongoose');
const Decimal = require('decimal.js');

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  variant: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'product.variants'
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  price: {
    type: Number,
    required: true
  },
  comparePrice: Number,
  customization: {
    type: Map,
    of: String
  },
  gift: {
    isGift: {
      type: Boolean,
      default: false
    },
    message: String,
    recipientName: String,
    recipientEmail: String
  },
  metadata: {
    addedFrom: {
      type: String,
      enum: ['product_page', 'search', 'recommendations', 'wishlist', 'quick_view'],
      default: 'product_page'
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    },
    priceAtTimeOfAdding: Number
  },
  appliedDiscounts: [{
    type: {
      type: String,
      enum: ['percentage', 'fixed', 'bogo', 'bundle']
    },
    value: Number,
    code: String,
    description: String,
    amount: Number
  }],
  reservationId: String,
  reservationExpiry: Date
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

cartItemSchema.virtual('subtotal').get(function() {
  return new Decimal(this.price).times(this.quantity).toNumber();
});

cartItemSchema.virtual('savings').get(function() {
  if (this.comparePrice && this.comparePrice > this.price) {
    return new Decimal(this.comparePrice - this.price).times(this.quantity).toNumber();
  }
  return 0;
});

cartItemSchema.virtual('discountAmount').get(function() {
  return this.appliedDiscounts.reduce((total, discount) => {
    return new Decimal(total).plus(discount.amount || 0).toNumber();
  }, 0);
});

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  sessionId: {
    type: String,
    index: true
  },
  items: [cartItemSchema],
  couponCodes: [{
    code: String,
    discount: Number,
    type: {
      type: String,
      enum: ['percentage', 'fixed']
    },
    appliedAt: Date
  }],
  giftCard: {
    code: String,
    amount: Number,
    appliedAt: Date
  },
  totals: {
    subtotal: {
      type: Number,
      default: 0
    },
    discount: {
      type: Number,
      default: 0
    },
    tax: {
      type: Number,
      default: 0
    },
    shipping: {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      default: 0
    }
  },
  currency: {
    type: String,
    default: 'USD'
  },
  notes: String,
  abandoned: {
    type: Boolean,
    default: false
  },
  abandonedAt: Date,
  recoveryEmailSent: {
    type: Boolean,
    default: false
  },
  recoveryEmailSentAt: Date,
  mergedFrom: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cart'
  }],
  expiresAt: {
    type: Date,
    index: true
  },
  metadata: {
    deviceType: String,
    ipAddress: String,
    userAgent: String,
    referrer: String,
    utmSource: String,
    utmMedium: String,
    utmCampaign: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

cartSchema.index({ user: 1, abandoned: 1 });
cartSchema.index({ sessionId: 1, createdAt: -1 });
cartSchema.index({ abandoned: 1, recoveryEmailSent: 1 });

cartSchema.virtual('itemCount').get(function() {
  return this.items.reduce((count, item) => count + item.quantity, 0);
});

cartSchema.virtual('uniqueItemCount').get(function() {
  return this.items.length;
});

cartSchema.virtual('totalSavings').get(function() {
  const itemSavings = this.items.reduce((total, item) => {
    return new Decimal(total).plus(item.savings || 0).toNumber();
  }, 0);
  return new Decimal(itemSavings).plus(this.totals.discount).toNumber();
});

cartSchema.pre('save', async function(next) {
  if (this.isModified('items')) {
    await this.calculateTotals();
  }

  if (this.items.length === 0 && !this.abandoned) {
    this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  } else if (!this.user) {
    this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  } else {
    this.expiresAt = undefined;
  }

  this.items.forEach(item => {
    item.metadata.lastUpdated = new Date();
  });

  next();
});

cartSchema.methods.calculateTotals = async function() {
  let subtotal = new Decimal(0);
  let discount = new Decimal(0);

  for (const item of this.items) {
    subtotal = subtotal.plus(item.subtotal);
    discount = discount.plus(item.discountAmount || 0);
  }

  this.couponCodes.forEach(coupon => {
    if (coupon.type === 'percentage') {
      discount = discount.plus(subtotal.times(coupon.discount / 100));
    } else {
      discount = discount.plus(coupon.discount);
    }
  });

  if (this.giftCard && this.giftCard.amount) {
    discount = discount.plus(this.giftCard.amount);
  }

  const taxRate = 0.08;
  const taxableAmount = subtotal.minus(discount);
  const tax = taxableAmount.times(taxRate);

  const shipping = await this.calculateShipping();

  const total = subtotal.minus(discount).plus(tax).plus(shipping);

  this.totals = {
    subtotal: subtotal.toNumber(),
    discount: discount.toNumber(),
    tax: tax.toNumber(),
    shipping: shipping,
    total: Math.max(0, total.toNumber())
  };
};

cartSchema.methods.calculateShipping = async function() {
  const weight = await this.getTotalWeight();
  
  if (this.totals.subtotal >= 100) {
    return 0;
  }
  
  if (weight <= 1) {
    return 5.99;
  } else if (weight <= 5) {
    return 9.99;
  } else if (weight <= 10) {
    return 14.99;
  } else {
    return 19.99 + ((weight - 10) * 1.5);
  }
};

cartSchema.methods.getTotalWeight = async function() {
  await this.populate('items.product');
  
  return this.items.reduce((total, item) => {
    const weight = item.product?.weight?.value || 0;
    return total + (weight * item.quantity);
  }, 0);
};

cartSchema.methods.addItem = async function(productId, quantity = 1, options = {}) {
  const Product = mongoose.model('Product');
  const product = await Product.findById(productId);
  
  if (!product) {
    throw new Error('Product not found');
  }

  if (product.status !== 'published') {
    throw new Error('Product is not available');
  }

  let price = product.basePrice;
  let variant = null;

  if (options.variantId) {
    variant = product.variants.id(options.variantId);
    if (!variant) {
      throw new Error('Variant not found');
    }
    price = variant.price;
  }

  const existingItemIndex = this.items.findIndex(item => {
    return item.product.toString() === productId.toString() &&
           (!options.variantId || item.variant?.toString() === options.variantId);
  });

  if (existingItemIndex !== -1) {
    this.items[existingItemIndex].quantity += quantity;
    this.items[existingItemIndex].price = price;
  } else {
    const newItem = {
      product: productId,
      variant: options.variantId,
      quantity,
      price,
      comparePrice: variant?.comparePrice || product.comparePrice,
      customization: options.customization,
      gift: options.gift,
      metadata: {
        addedFrom: options.addedFrom || 'product_page',
        addedAt: new Date(),
        priceAtTimeOfAdding: price
      }
    };

    this.items.push(newItem);
  }

  await this.save();
  return this;
};

cartSchema.methods.removeItem = async function(itemId) {
  const itemIndex = this.items.findIndex(item => 
    item._id.toString() === itemId.toString()
  );

  if (itemIndex === -1) {
    throw new Error('Item not found in cart');
  }

  const removedItem = this.items.splice(itemIndex, 1)[0];

  if (removedItem.reservationId) {
    const stockService = require('../services/stockService');
    await stockService.releaseStock([{
      productId: removedItem.product,
      variantId: removedItem.variant,
      quantity: removedItem.quantity
    }]);
  }

  await this.save();
  return removedItem;
};

cartSchema.methods.updateItemQuantity = async function(itemId, quantity) {
  const item = this.items.id(itemId);
  
  if (!item) {
    throw new Error('Item not found in cart');
  }

  if (quantity <= 0) {
    return this.removeItem(itemId);
  }

  const oldQuantity = item.quantity;
  item.quantity = quantity;

  if (item.reservationId) {
    const stockService = require('../services/stockService');
    const quantityDiff = quantity - oldQuantity;
    
    if (quantityDiff > 0) {
      await stockService.reserveStock([{
        productId: item.product,
        variantId: item.variant,
        quantity: quantityDiff
      }]);
    } else if (quantityDiff < 0) {
      await stockService.releaseStock([{
        productId: item.product,
        variantId: item.variant,
        quantity: Math.abs(quantityDiff)
      }]);
    }
  }

  await this.save();
  return this;
};

cartSchema.methods.clear = async function() {
  if (this.items.length > 0) {
    const stockService = require('../services/stockService');
    const itemsToRelease = this.items
      .filter(item => item.reservationId)
      .map(item => ({
        productId: item.product,
        variantId: item.variant,
        quantity: item.quantity
      }));

    if (itemsToRelease.length > 0) {
      await stockService.releaseStock(itemsToRelease);
    }
  }

  this.items = [];
  this.couponCodes = [];
  this.giftCard = undefined;
  this.totals = {
    subtotal: 0,
    discount: 0,
    tax: 0,
    shipping: 0,
    total: 0
  };

  await this.save();
  return this;
};

cartSchema.methods.merge = async function(otherCart) {
  if (!otherCart || otherCart._id.equals(this._id)) {
    return this;
  }

  for (const item of otherCart.items) {
    const existingItem = this.items.find(i => 
      i.product.equals(item.product) && 
      ((!i.variant && !item.variant) || 
       (i.variant && item.variant && i.variant.equals(item.variant)))
    );

    if (existingItem) {
      existingItem.quantity += item.quantity;
      existingItem.price = item.price;
    } else {
      this.items.push(item);
    }
  }

  this.mergedFrom.push(otherCart._id);
  await this.save();

  await otherCart.deleteOne();
  return this;
};

cartSchema.methods.checkAbandonment = async function() {
  const inactivityPeriod = 60 * 60 * 1000;
  const now = new Date();
  const lastActivity = this.updatedAt || this.createdAt;

  if (!this.abandoned && 
      this.items.length > 0 && 
      (now - lastActivity) > inactivityPeriod) {
    this.abandoned = true;
    this.abandonedAt = now;
    await this.save();
    return true;
  }

  return false;
};

cartSchema.statics.findOrCreate = async function(identifier) {
  let cart;
  
  if (identifier.userId) {
    cart = await this.findOne({ 
      user: identifier.userId, 
      abandoned: false 
    }).sort('-updatedAt');
  } else if (identifier.sessionId) {
    cart = await this.findOne({ 
      sessionId: identifier.sessionId,
      abandoned: false
    }).sort('-updatedAt');
  }

  if (!cart) {
    cart = await this.create({
      user: identifier.userId,
      sessionId: identifier.sessionId,
      metadata: identifier.metadata
    });
  }

  return cart;
};

cartSchema.statics.cleanupExpired = async function() {
  const result = await this.deleteMany({
    expiresAt: { $lte: new Date() }
  });
  return result.deletedCount;
};

module.exports = mongoose.model('Cart', cartSchema);