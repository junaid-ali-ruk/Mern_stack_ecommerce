const mongoose = require('mongoose');

const wishlistItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  variant: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'product.variants'
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  notes: String,
  priority: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  priceAlert: {
    enabled: {
      type: Boolean,
      default: false
    },
    targetPrice: Number,
    lastNotified: Date
  },
  metadata: {
    addedFrom: String,
    originalPrice: Number,
    lowestPrice: Number,
    highestPrice: Number,
    priceHistory: [{
      price: Number,
      date: Date
    }]
  }
});

const wishlistSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    default: 'My Wishlist'
  },
  items: [wishlistItemSchema],
  visibility: {
    type: String,
    enum: ['private', 'public', 'shared'],
    default: 'private'
  },
  sharedWith: [{
    email: String,
    sharedAt: Date,
    canEdit: {
      type: Boolean,
      default: false
    }
  }],
  shareToken: String,
  tags: [String],
  occasion: String,
  targetDate: Date,
  isDefault: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

wishlistSchema.index({ user: 1, isDefault: 1 });
wishlistSchema.index({ shareToken: 1 }, { sparse: true });
wishlistSchema.index({ 'items.product': 1 });

wishlistSchema.methods.addItem = async function(productId, variantId = null) {
  const existingItem = this.items.find(item => 
    item.product.toString() === productId.toString() &&
    (!variantId || item.variant?.toString() === variantId)
  );

  if (existingItem) {
    throw new Error('Item already in wishlist');
  }

  const Product = mongoose.model('Product');
  const product = await Product.findById(productId);
  
  if (!product) {
    throw new Error('Product not found');
  }

  const price = variantId ? 
    product.variants.id(variantId)?.price : 
    product.basePrice;

  this.items.push({
    product: productId,
    variant: variantId,
    metadata: {
      originalPrice: price,
      lowestPrice: price,
      highestPrice: price,
      priceHistory: [{ price, date: new Date() }]
    }
  });

  await this.save();
  return this;
};

wishlistSchema.methods.removeItem = async function(itemId) {
  const itemIndex = this.items.findIndex(item => 
    item._id.toString() === itemId.toString()
  );

  if (itemIndex === -1) {
    throw new Error('Item not found in wishlist');
  }

  this.items.splice(itemIndex, 1);
  await this.save();
  return this;
};

wishlistSchema.methods.moveToCart = async function(itemId, cartId) {
  const item = this.items.id(itemId);
  
  if (!item) {
    throw new Error('Item not found in wishlist');
  }

  const Cart = mongoose.model('Cart');
  const cart = await Cart.findById(cartId);
  
  if (!cart) {
    throw new Error('Cart not found');
  }

  await cart.addItem(item.product, 1, {
    variantId: item.variant,
    addedFrom: 'wishlist'
  });

  this.items.pull(itemId);
  await this.save();

  return { cart, wishlist: this };
};

wishlistSchema.methods.checkPriceChanges = async function() {
  const Product = mongoose.model('Product');
  const priceChanges = [];

  for (const item of this.items) {
    const product = await Product.findById(item.product);
    if (!product) continue;

    const currentPrice = item.variant ? 
      product.variants.id(item.variant)?.price : 
      product.basePrice;

    const lastPrice = item.metadata.priceHistory[item.metadata.priceHistory.length - 1]?.price;

    if (currentPrice !== lastPrice) {
      item.metadata.priceHistory.push({
        price: currentPrice,
        date: new Date()
      });

      if (currentPrice < item.metadata.lowestPrice) {
        item.metadata.lowestPrice = currentPrice;
      }
      if (currentPrice > item.metadata.highestPrice) {
        item.metadata.highestPrice = currentPrice;
      }

      priceChanges.push({
        item: item._id,
        product: product.name,
        oldPrice: lastPrice,
        newPrice: currentPrice,
        change: currentPrice - lastPrice,
        changePercent: ((currentPrice - lastPrice) / lastPrice * 100).toFixed(2)
      });

      if (item.priceAlert.enabled && currentPrice <= item.priceAlert.targetPrice) {
        priceChanges[priceChanges.length - 1].alertTriggered = true;
        item.priceAlert.lastNotified = new Date();
      }
    }
  }

  if (priceChanges.length > 0) {
    await this.save();
  }

  return priceChanges;
};

wishlistSchema.statics.getDefaultWishlist = async function(userId) {
  let wishlist = await this.findOne({ user: userId, isDefault: true });
  
  if (!wishlist) {
    wishlist = await this.create({
      user: userId,
      isDefault: true,
      name: 'My Wishlist'
    });
  }

  return wishlist;
};

module.exports = mongoose.model('Wishlist', wishlistSchema);