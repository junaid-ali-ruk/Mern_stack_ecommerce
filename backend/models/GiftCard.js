const mongoose = require('mongoose');
const crypto = require('crypto');

const giftCardTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['purchase', 'redemption', 'refund', 'adjustment', 'expiry'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  balanceBefore: Number,
  balanceAfter: Number,
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const giftCardSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    index: true
  },
  pin: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['physical', 'digital', 'promotional'],
    default: 'digital'
  },
  initialValue: {
    type: Number,
    required: true,
    min: 0
  },
  currentBalance: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'depleted', 'expired', 'cancelled'],
    default: 'inactive',
    index: true
  },
  purchaser: {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    email: String,
    name: String,
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    }
  },
  recipient: {
    email: String,
    name: String,
    message: String,
    sendDate: Date,
    sent: {
      type: Boolean,
      default: false
    }
  },
  validity: {
    activationDate: Date,
    expiryDate: Date,
    issuedDate: {
      type: Date,
      default: Date.now
    }
  },
  transactions: [giftCardTransactionSchema],
  restrictions: {
    minPurchase: Number,
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
    }]
  },
  metadata: {
    design: String,
    occasion: String,
    source: {
      type: String,
      enum: ['purchase', 'promotion', 'refund', 'compensation'],
      default: 'purchase'
    },
    notes: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  lastUsed: Date,
  usageCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

giftCardSchema.index({ code: 1, status: 1 });
giftCardSchema.index({ 'recipient.email': 1 });
giftCardSchema.index({ 'validity.expiryDate': 1 });

giftCardSchema.methods.generateCode = function() {
  const prefix = 'GC';
  const random = crypto.randomBytes(6).toString('hex').toUpperCase();
  this.code = `${prefix}-${random.slice(0, 4)}-${random.slice(4, 8)}-${random.slice(8)}`;
  return this.code;
};

giftCardSchema.methods.generatePin = function() {
  this.pin = crypto.randomBytes(2).toString('hex').toUpperCase();
  return this.pin;
};

giftCardSchema.methods.activate = async function() {
  if (this.status !== 'inactive') {
    throw new Error('Gift card is already active or has been used');
  }
  
  this.status = 'active';
  this.validity.activationDate = new Date();
  
  if (!this.validity.expiryDate) {
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    this.validity.expiryDate = expiryDate;
  }
  
  await this.save();
  return this;
};

giftCardSchema.methods.redeem = async function(amount, orderId, userId) {
  if (this.status !== 'active') {
    throw new Error('Gift card is not active');
  }
  
  if (this.currentBalance < amount) {
    throw new Error(`Insufficient balance. Available: ${this.currentBalance}`);
  }
  
  if (this.validity.expiryDate && new Date() > this.validity.expiryDate) {
    this.status = 'expired';
    await this.save();
    throw new Error('Gift card has expired');
  }
  
  const transaction = {
    type: 'redemption',
    amount: -amount,
    balanceBefore: this.currentBalance,
    balanceAfter: this.currentBalance - amount,
    order: orderId,
    user: userId
  };
  
  this.currentBalance -= amount;
  this.transactions.push(transaction);
  this.lastUsed = new Date();
  this.usageCount += 1;
  
  if (this.currentBalance === 0) {
    this.status = 'depleted';
  }
  
  await this.save();
  return transaction;
};

giftCardSchema.methods.addValue = async function(amount, reason) {
  const transaction = {
    type: 'adjustment',
    amount: amount,
    balanceBefore: this.currentBalance,
    balanceAfter: this.currentBalance + amount,
    notes: reason
  };
  
  this.currentBalance += amount;
  this.transactions.push(transaction);
  
  if (this.status === 'depleted' && this.currentBalance > 0) {
    this.status = 'active';
  }
  
  await this.save();
  return transaction;
};

giftCardSchema.methods.checkBalance = function() {
  return {
    code: this.code,
    balance: this.currentBalance,
    currency: this.currency,
    status: this.status,
    expiryDate: this.validity.expiryDate
  };
};

giftCardSchema.methods.canBeUsed = function(cart = null) {
  if (this.status !== 'active') {
    return { valid: false, reason: 'Gift card is not active' };
  }
  
  if (this.currentBalance <= 0) {
    return { valid: false, reason: 'Gift card has no balance' };
  }
  
  if (this.validity.expiryDate && new Date() > this.validity.expiryDate) {
    return { valid: false, reason: 'Gift card has expired' };
  }
  
  if (cart && this.restrictions.minPurchase && cart.totals.subtotal < this.restrictions.minPurchase) {
    return { valid: false, reason: `Minimum purchase of ${this.restrictions.minPurchase} required` };
  }
  
  return { valid: true };
};

giftCardSchema.statics.createBulk = async function(count, value, options = {}) {
  const cards = [];
  
  for (let i = 0; i < count; i++) {
    const card = new this({
      initialValue: value,
      currentBalance: value,
      ...options
    });
    
    card.generateCode();
    card.generatePin();
    
    await card.save();
    cards.push(card);
  }
  
  return cards;
};

module.exports = mongoose.model('GiftCard', giftCardSchema);