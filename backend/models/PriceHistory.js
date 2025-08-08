const mongoose = require('mongoose');

const priceHistorySchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  variant: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'product.variants'
  },
  price: {
    type: Number,
    required: true
  },
  comparePrice: Number,
  currency: {
    type: String,
    default: 'USD'
  },
  changeType: {
    type: String,
    enum: ['increase', 'decrease', 'initial'],
    required: true
  },
  changeAmount: Number,
  changePercent: Number,
  previousPrice: Number,
  reason: String,
  promotionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Promotion'
  },
  affectedCarts: [{
    cart: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cart'
    },
    notified: {
      type: Boolean,
      default: false
    }
  }],
  affectedWishlists: [{
    wishlist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wishlist'
    },
    notified: {
      type: Boolean,
      default: false
    }
  }],
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  automatic: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

priceHistorySchema.index({ product: 1, createdAt: -1 });
priceHistorySchema.index({ variant: 1, createdAt: -1 });
priceHistorySchema.index({ createdAt: -1 });

priceHistorySchema.statics.recordPriceChange = async function(productId, newPrice, options = {}) {
  const Product = mongoose.model('Product');
  const product = await Product.findById(productId);
  
  if (!product) {
    throw new Error('Product not found');
  }
  
  const previousPrice = options.variantId ? 
    product.variants.id(options.variantId)?.price : 
    product.basePrice;
  
  const changeAmount = newPrice - previousPrice;
  const changePercent = (changeAmount / previousPrice * 100).toFixed(2);
  const changeType = changeAmount > 0 ? 'increase' : changeAmount < 0 ? 'decrease' : 'initial';
  
  const priceHistory = await this.create({
    product: productId,
    variant: options.variantId,
    price: newPrice,
    comparePrice: options.comparePrice,
    changeType,
    changeAmount: Math.abs(changeAmount),
    changePercent: Math.abs(changePercent),
    previousPrice,
    reason: options.reason,
    promotionId: options.promotionId,
    recordedBy: options.userId,
    automatic: options.automatic || false
  });
  
  await this.notifyAffectedUsers(productId, options.variantId, priceHistory);
  
  return priceHistory;
};

priceHistorySchema.statics.notifyAffectedUsers = async function(productId, variantId, priceHistory) {
  const Cart = mongoose.model('Cart');
  const Wishlist = mongoose.model('Wishlist');
  
  const affectedCarts = await Cart.find({
    'items.product': productId,
    abandoned: false
  });
  
  for (const cart of affectedCarts) {
    const item = cart.items.find(i => 
      i.product.toString() === productId.toString() &&
      (!variantId || i.variant?.toString() === variantId)
    );
    
    if (item) {
      priceHistory.affectedCarts.push({
        cart: cart._id,
        notified: false
      });
    }
  }
  
  const affectedWishlists = await Wishlist.find({
    'items.product': productId
  });
  
  for (const wishlist of affectedWishlists) {
    const item = wishlist.items.find(i => 
      i.product.toString() === productId.toString() &&
      (!variantId || i.variant?.toString() === variantId)
    );
    
    if (item) {
      priceHistory.affectedWishlists.push({
        wishlist: wishlist._id,
        notified: false
      });
      
      if (item.priceAlert.enabled && 
          priceHistory.price <= item.priceAlert.targetPrice) {
        await this.sendPriceAlert(wishlist.user, item, priceHistory);
      }
    }
  }
  
  await priceHistory.save();
};

priceHistorySchema.statics.sendPriceAlert = async function(userId, item, priceHistory) {
  console.log(`Price alert for user ${userId}: Product price dropped to ${priceHistory.price}`);
};

module.exports = mongoose.model('PriceHistory', priceHistorySchema);