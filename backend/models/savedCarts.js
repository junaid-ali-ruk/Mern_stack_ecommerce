const mongoose = require('mongoose');

const savedCartItemSchema = new mongoose.Schema({
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
    min: 1
  },
  savedPrice: Number,
  currentPrice: Number,
  priceChanged: {
    type: Boolean,
    default: false
  },
  priceChangeAmount: Number,
  priceChangePercent: Number,
  notes: String
});

const savedCartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    default: 'Saved Cart'
  },
  description: String,
  items: [savedCartItemSchema],
  purpose: {
    type: String,
    enum: ['personal', 'gift', 'business', 'event', 'recurring', 'other'],
    default: 'personal'
  },
  eventDate: Date,
  reminderEnabled: {
    type: Boolean,
    default: false
  },
  reminderDate: Date,
  isTemplate: {
    type: Boolean,
    default: false
  },
  shareToken: {
    type: String,
    unique: true,
    sparse: true
  },
  sharedWith: [{
    email: String,
    permission: {
      type: String,
      enum: ['view', 'edit'],
      default: 'view'
    },
    sharedAt: Date
  }],
  tags: [String],
  totalItemsWhenSaved: Number,
  totalPriceWhenSaved: Number,
  lastActivated: Date,
  activationCount: {
    type: Number,
    default: 0
  },
  autoReplenish: {
    enabled: {
      type: Boolean,
      default: false
    },
    frequency: {
      type: String,
      enum: ['weekly', 'biweekly', 'monthly', 'quarterly'],
      default: 'monthly'
    },
    nextDate: Date
  }
}, {
  timestamps: true
});

savedCartSchema.index({ user: 1, createdAt: -1 });
savedCartSchema.index({ shareToken: 1 }, { sparse: true });
savedCartSchema.index({ 'autoReplenish.nextDate': 1 }, { sparse: true });

savedCartSchema.methods.updatePrices = async function() {
  const Product = mongoose.model('Product');
  let hasChanges = false;
  let totalPriceChange = 0;

  for (const item of this.items) {
    const product = await Product.findById(item.product);
    if (!product) continue;

    let currentPrice = product.basePrice;
    if (item.variant) {
      const variant = product.variants.id(item.variant);
      if (variant) {
        currentPrice = variant.price;
      }
    }

    if (currentPrice !== item.savedPrice) {
      item.currentPrice = currentPrice;
      item.priceChanged = true;
      item.priceChangeAmount = currentPrice - item.savedPrice;
      item.priceChangePercent = ((currentPrice - item.savedPrice) / item.savedPrice * 100).toFixed(2);
      totalPriceChange += item.priceChangeAmount * item.quantity;
      hasChanges = true;
    } else {
      item.currentPrice = item.savedPrice;
      item.priceChanged = false;
      item.priceChangeAmount = 0;
      item.priceChangePercent = 0;
    }
  }

  if (hasChanges) {
    await this.save();
  }

  return {
    hasChanges,
    totalPriceChange,
    items: this.items.filter(i => i.priceChanged)
  };
};

savedCartSchema.methods.activateCart = async function() {
  const Cart = mongoose.model('Cart');
  const cart = await Cart.findOrCreate({ userId: this.user });

  for (const item of this.items) {
    await cart.addItem(item.product, item.quantity, {
      variantId: item.variant,
      addedFrom: 'saved_cart'
    });
  }

  this.lastActivated = new Date();
  this.activationCount += 1;
  await this.save();

  return cart;
};

savedCartSchema.methods.generateShareToken = function() {
  const crypto = require('crypto');
  this.shareToken = crypto.randomBytes(32).toString('hex');
  return this.shareToken;
};

module.exports = mongoose.model('SavedCart', savedCartSchema);